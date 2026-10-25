# Pay for misomoon Cloud

misomoon Cloud plans are paid by card through [Polar](https://polar.sh), the merchant of
record. Polar sells you the plan, charges the card, adds the sales tax or VAT your
country needs, and sends the invoices. misomoon never sees your card.

A plan belongs to a team ([Plans](cloud.md#plans)). The team's owners and billing members
pay for it, in **Settings** > **Team**. Admins see the plans and their prices there without
the buttons. Open one of the team's sites first: **Settings** always shows the team of the
open site.

## Choose a plan

1. Open **Settings** > **Team**.
2. In the **Plan** card, select **Choose Starter**, **Choose Growth**, or **Choose Scale**.
3. Pay in Polar's checkout. Your account's email is filled in, and Polar shows the tax for
   your country and the total before you pay.
4. Polar sends you back to **Settings** > **Team**, which says **Payment received** until
   Polar confirms the payment, usually within a minute. The plan's limits then apply. The
   tracker endpoint keeps what it knows about a team for up to a minute, so a team that
   had stopped recording starts again within a minute after that.

Prices are in US dollars a month, as on [misomoon.com/pricing](https://misomoon.com/pricing).

## Switch plans

1. In the **Plan** card, select **Switch to** on the plan you want, such as
   **Switch to Scale**.
2. Check the plan and its price, then select **Switch now**.

misomoon changes the subscription the team already pays for, so a team never pays for two
plans. The card on file pays the new price. Polar works out the difference for the rest of
the period: it charges the card for a bigger plan and credits a smaller one. If Polar
schedules the switch for the next renewal, the dashboard says on which day the new plan
starts, and the team stays on its current plan until then.

If Polar can't charge the card for the switch, nothing changes. Update the card in
**Manage billing**, then switch again. A move to a smaller plan keeps every site and
setting ([Move to a smaller plan](cloud.md#move-to-a-smaller-plan)).

## Change the card, get invoices, or cancel

Select **Manage billing** in the **Plan** card. It opens Polar's customer portal, where you
can change the card, download invoices and receipts, and cancel the subscription. The
portal shows every subscription paid by the same Polar customer, so a person who pays for
two teams sees both. **Manage billing** shows once the team has paid for a plan.

## Cancel a plan

Cancel in **Manage billing**. The plan stays until the end of the period you paid for. The
**Plan** card shows that the plan is canceled and the day it ends. To keep it, select
the plan's **Keep** button before that day, such as **Keep Growth**. Polar then charges the
card again at renewal. Switching to another plan before that day also keeps the subscription.

When the period ends, the team has no plan. A team whose trial has ended then lapses:
misomoon stops recording its pageviews and events, and it can't add sites
([Try it free for 7 days](cloud.md#try-it-free-for-7-days)). A team still in its trial
keeps the trial's limits until the trial ends. Your sites, settings, and numbers stay, and
choosing a plan again starts recording within a minute.

## When a payment fails

When Polar can't charge a renewal, the **Plan** card says that the last payment failed,
and the team keeps its plan. Polar emails the person who paid, with a link to the portal,
and tries the card again 2, 7, 14, and 21 days after the first failure. Update the card
in **Manage billing**, and Polar charges it again at once.

If every attempt fails, Polar ends the subscription and the team has no plan, as after a
cancel. Choose a plan to pay again.

## How Polar and misomoon keep the plan in step

This section is for whoever runs a misomoon server with billing, and for support.

Polar sends a webhook to `POST /api/billing/polar/webhook` for every change to a
subscription. Each one carries the whole subscription, and misomoon sets the team's plan
from it:

| Polar event | What happens to the team |
| --- | --- |
| `subscription.created`, `subscription.active` | The plan of the subscription's product, `plan_status` `active`, and the end of the paid period. An `incomplete` subscription, one not paid yet, changes nothing. |
| `subscription.updated` | The same, from the subscription as it is now: a switch, a renewal, or a recovered payment. |
| `subscription.canceled` | The plan stays. `plan_status` is `canceled`, and the period end is the day the plan ends. |
| `subscription.uncanceled` | `plan_status` is `active` again. |
| `subscription.past_due` | The plan stays. `plan_status` is `past_due` while Polar tries the card again. |
| `subscription.revoked` | The plan ends: `teams.plan` is `NULL`. The team keeps its Polar customer, so **Manage billing** still opens its invoices. |

misomoon finds the team from the `team_id` it puts in the checkout's metadata, which
Polar copies to the subscription. A subscription stays with the team it first came with.

Webhooks can arrive late and out of order. misomoon keeps every subscription in its newest
state, by Polar's `modified_at`, and a webhook with an older state changes nothing. A
delivery Polar retries carries the same `webhook-id`, and misomoon handles each id once.

If a team pays for two subscriptions at once, for example after two checkouts in two
tabs, the newer one sets the plan and the log shows
`team pays for more than one subscription`. Cancel and refund the other in Polar.

### Plans that support sets

Support can still set `teams.plan` by hand ([Set a team's plan](configuration.md#set-a-teams-plan)):

- A team that never had a subscription keeps the plan support sets. Webhooks never
  touch it.
- A team with a subscription takes its plan from Polar. A change by hand lasts until
  Polar's next webhook for that subscription. To change such a team's plan, switch the
  subscription in Polar instead.
- When a team's subscription ends, its plan becomes `NULL`, even one set by hand. Set it
  again after the revocation if the team should keep a plan.
- A team on a plan set by hand can still choose a plan and pay. The subscription's plan
  then replaces the one set by hand.

## Set up billing on your server

misomoon Cloud runs this setup. A self-hosted server has no plans and no billing: the
deploy bundle leaves out `PLANS` and every `POLAR_*` setting. To try billing, do these
steps in [Polar's sandbox](https://sandbox.polar.sh) first, with `POLAR_SERVER=sandbox`.
The sandbox needs its own account, token, products, and webhook.

1. In Polar, create three products with a monthly recurring price in US dollars: Starter,
   Growth, and Scale, with the prices in `PLANS` in `packages/core/src/plans.ts`. Copy
   each product's id.
2. In the Polar organization's settings, create an organization access token with the
   scopes `checkouts:write`, `customer_sessions:write`, `subscriptions:read`, and
   `subscriptions:write`.
3. In Polar, open **Settings** > **Webhooks** and add an endpoint:
   - URL: your dashboard's address with `/api/billing/polar/webhook`, for example
     `https://app.misomoon.com/api/billing/polar/webhook`.
   - Format: **Raw**.
   - API version: `2026-10`.
   - Events: `subscription.created`, `subscription.active`, `subscription.updated`,
     `subscription.canceled`, `subscription.uncanceled`, `subscription.past_due`, and
     `subscription.revoked`.

   Copy the endpoint's secret, which starts with `whsec_`.
4. In `apps/api`, set the two secrets. Each command asks for the value, and each one
   deploys a new version of the Worker at once:

   ```sh
   wrangler secret put POLAR_ACCESS_TOKEN
   wrangler secret put POLAR_WEBHOOK_SECRET
   ```

5. In `vars` in `apps/api/wrangler.jsonc`, add `POLAR_PRODUCT_STARTER`,
   `POLAR_PRODUCT_GROWTH`, and `POLAR_PRODUCT_SCALE` with the product ids, and
   `POLAR_SERVER` set to `sandbox` while you test. Keep `PLANS` set to `on`. Deploy.
6. Sign in to the dashboard. `GET /api/v1/me` now says `"billing": true`, and the
   **Plan** card shows the plans. Choose one and pay with a test card from
   [Polar's sandbox docs](https://polar.sh/docs/integrate/sandbox). The plan shows within
   a minute.

Three Polar settings change what customers see:

- **Settings** > **Subscriptions** has the proration setting. It decides how a switch is
  billed, from the dashboard and from the portal alike. misomoon sends no proration of its
  own.
- The default tax behavior, in the payment settings, decides whether prices include tax
  or Polar adds it at checkout.
- The customer portal settings decide what customers can do there. A customer who
  switches plans in the portal changes the team's plan the same way.

[Configuration](configuration.md#billing) lists each setting.

### Test billing on your machine

The [Polar CLI](https://polar.sh/docs/integrate/cli/webhooks) forwards the sandbox
organization's webhooks to `wrangler dev`, so you can pay for a plan without deploying and
without a webhook endpoint in Polar.

1. Do steps 1 and 2 above in the sandbox.
2. Install the CLI, and sign in to the sandbox:

   ```sh
   npm install -g @polar-sh/cli
   polar auth login --sandbox
   ```

3. Start forwarding, and leave it running. It prints a secret.

   ```sh
   polar webhook listen http://localhost:8787/api/billing/polar/webhook
   ```

4. In `apps/api/.dev.vars`, set `POLAR_ACCESS_TOKEN` to the sandbox token,
   `POLAR_WEBHOOK_SECRET` to the secret the CLI printed, `POLAR_SERVER` to `sandbox`, and
   the three `POLAR_PRODUCT_*` ids. Start the API and the dashboard as
   [CONTRIBUTING.md](../CONTRIBUTING.md#run-it-locally) shows.
5. Open the dashboard at `http://localhost:5173`, choose a plan, and pay with a test card.

The CLI logs each event with misomoon's answer: `200` when it set the team's plan, and
`202` for an event that changes nothing, such as `order.paid`.

### When something fails

- Without `PLANS=on`, the billing routes answer `404` and the dashboard shows no billing.
- With `PLANS=on` and a Polar setting missing, the routes answer `501` and name the missing
  settings, the webhook included, and the dashboard shows no billing.
- A webhook with a wrong signature, or a `webhook-timestamp` more than 5 minutes old,
  answers `401` and changes nothing. Check `POLAR_WEBHOOK_SECRET`. Polar retries a failed
  delivery up to 10 times, and after 10 failures in a row it turns the endpoint off and
  emails the organization. Turn it back on in **Settings** > **Webhooks** once it works.
- A subscription to a product that is not one of the three answers `202`, changes nothing,
  and logs `unknown Polar product`. A subscription without a `team_id`, or of a deleted
  team, logs `polar subscription without a team` or `polar subscription of a deleted team`.
- When Polar refuses a request, the route answers `502` with Polar's message, and the log
  has `polar error` with Polar's status. A wrong token or a token for the other
  `POLAR_SERVER` shows up here.

## What misomoon stores

For each team that pays, misomoon stores Polar's customer id and subscription id, the
subscription's status and product, and the end of the paid period, in the control
database (`teams` and `polar_subscriptions`). It also keeps the `webhook-id` of each
webhook for 30 days. Polar keeps the card, the billing address, the tax details, and the
invoices.
