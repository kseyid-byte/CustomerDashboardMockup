# Customer Cockpit Mockup

Operational sales dashboard mockup for sales reps, Key Account Managers, regional managers, and leadership.

## Run

```bash
cd /path/to/CustomerDashboardMockup
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Data Layer

Mock CSV files live in `public/data`. The frontend reads them through `loadDataProducts()` in `src/app.js`. That function is the intended replacement point for Databricks later.

Expected future Databricks-backed products:

- `accounts`
- `performance`
- `orders`
- `inventory`
- `opportunities`
- `interactions`
- `weather`
- `alerts`
- `feedback`
- `waterfall`
- `account_health`
- `annual_plan`
- `last_year_sales`
- `sell_out`
- `data_freshness`
- `rebate_tiers`
- `next_best_actions`
- `weather_alerts`

## Included Actions

- Filter by period, region, territory, sales rep, customer, crop, product, channel, and season
- Drill into customer/account details
- View weather and external signals
- View alerts and open recommended actions
- Create opportunities
- Submit feedback
- Mark commitments complete
- Export filtered views to CSV
