# Price Tracker Worker

A Cloudflare Workers project to track product prices from various e-commerce websites. It periodically checks the prices of specified products and logs any changes. Notifications can be sent via Telegram when price changes are detected.

## Setup

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/cli-wrangler/install-update).
2. Clone this repository.
3. Configure your `wrangler.jsonc` file with your Cloudflare account details and desired settings.
4. Define the products you want to track in the `ITEMS` in `wrangler.jsonc`.
5. Configure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_TOKEN` environment variables for notifications as secret in Cloudflare Workers.
6. Set up a KV namespace for storing price data and bind it in `wrangler.jsonc`.
5. Deploy the worker using `wrangler deploy`.

## Usage

Once deployed, the worker will periodically check the prices of the defined products and log any changes. You can customize the frequency of checks and notification methods as needed.