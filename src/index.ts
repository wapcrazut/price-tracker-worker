export interface Env {
  PRICES: KVNamespace;                         // KV binding
  TELEGRAM_BOT_TOKEN: string;                  // secret
  TELEGRAM_CHAT_ID: string;                    // secret
  ITEMS: Item[];                               // items to track
}

// EU/US formats
function parsePrice(text: string): number | null {
  const m = text.replace(/\u00A0/g, ' ')
                .match(/(?:€|\$|£)?\s*([0-9]{1,3}(?:[.,\s][0-9]{3})*|[0-9]+)(?:[.,]([0-9]{1,2}))?\s*(?:€|\$|£)?/);
  if (!m) return null;
  const whole = (m[1] || '').replace(/[.,\s]/g, '');
  const cents = m[2] ? '.' + m[2] : '';
  const num = Number(whole + cents);
  return isFinite(num) ? num : null;
}

async function extractPrice(html: string, css?: string, regex?: string, attribute?: string): Promise<number | null> {
  if (regex) {
    const re = new RegExp(regex, 'ims');
    const mm = html.match(re);
    if (mm) {
      const txt = (mm[1] ?? mm[0]).slice(0, 5000); // cap length
      const p = parsePrice(txt);
      if (p != null) return p;
    }
  }

  if (css) {
    let captured = '';
    class Capture {
      element(e: Element) {
        // If you set "attribute" in your ITEMS_JSON (e.g., "content"), read it directly.
        if (attribute) {
          const val = e.getAttribute(attribute);
          if (val) captured = val;
        }
      }
      text(t: any) {
        if (!attribute) captured += t.text;
      }
    }

    await new HTMLRewriter().on(css, new Capture()).transform(new Response(html)).text();

    const candidate = captured || ''; // empty if selector didn't match
    const p = parsePrice(candidate);
    if (p != null) return p;
  }

  return parsePrice(html);
}

type Item = {
  name: string;
  url: string;
  css?: string;
  regex?: string;
  currency?: string;
  enabled?: boolean;
  timeoutMs?: number;
};

async function fetchHtml(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PriceTrackerBot/1.0)',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: ctrl.signal
  });
  clearTimeout(t);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

async function sendTelegram(env: Env, text: string) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
  });
}

function fmt(currency: string | undefined, n: number) {
  return `${currency ?? '€'}${n.toFixed(2)}`;
}

export default {
  // Manual trigger via HTTP GET
  async fetch(_req: Request, env: Env): Promise<Response> {
    const out = await run(env);
    return new Response(out, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
  // Daily Cron trigger
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await run(env);
  }
};

async function run(env: Env): Promise<string> {
  const items: Item[] = (env.ITEMS ?? []).filter(i => i.enabled !== false);
  const lines: string[] = [`*Daily Price Report — ${new Date().toISOString().slice(0,10)}*`];
  let changes = 0, errors = 0;

  for (const it of items) {
    try {
      const html = await fetchHtml(it.url, it.timeoutMs ?? 20000);
      const price = await extractPrice(html, it.css, it.regex);
      if (price == null) { errors++; lines.push(`• *${it.name}*: could not find price`); continue; }

      const key = `last:${it.name}`;
      const prevStr = await env.PRICES.get(key);
      const prev = prevStr ? Number(prevStr) : null;
      if (prev == null || Math.abs(prev - price) > 1e-6) changes++;

      await env.PRICES.put(key, String(price));
      lines.push(`• *${it.name}*: ${fmt(it.currency, price)}${
        prev==null ? " (new)" :
        price===prev ? " (no change)" :
        ` (${price> (prev||0) ? "+" : "-"}${fmt(it.currency, Math.abs(price-(prev||0)))})`
      }`);
    } catch (e: any) {
      errors++; lines.push(`• *${it.name}*: error — ${e?.message ?? e}`);
    }
  }

  if (!items.length) lines.push('_No items configured._');
  if (errors) lines.push('\n_One or more items returned errors. Check selectors/regex or site changes._');
  lines.push(`\nTracked ${items.length} item(s); ${changes} change(s).`);

  const msg = lines.join('\n');
  await sendTelegram(env, msg);
  return msg;
}
