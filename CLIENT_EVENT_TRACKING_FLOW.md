# Event tracking flow — client confirmation

This is how Track MyAds handles a campaign that has more than one event on the same click.

## Example campaign

Offer: **Game App**

| Event | Type | Advertiser revenue | Publisher payout |
|---|---|---|---|
| `install` | Funnel | 0 | 0 |
| `registration` | Funnel | 0 | 0 |
| `first_deposit` | **Primary (billable)** | 20 | 12 |

Only `first_deposit` is a conversion. The other events are signals. They do not create revenue and they do not use the cap.

## 1. Setup, once

1. Add the exact event codes the advertiser will send on the offer. Case does not matter: `FTD` and `ftd` are the same.
2. Mark one event as the primary goal. Set its revenue and payout.
3. Put this on the publisher **Global Postback URL**:

```
https://publisher.com/postback?click_id={affiliate_click_id}&event={event}&payout={payout}&status={status}
```

`{affiliate_click_id}` is the publisher's own click id. `{event}` becomes `install`, `registration`, or `first_deposit`.

If that offer's assignment has its own Callback URL filled in, the global URL is not used. Leave the assignment callback empty when every event should go to the same URL.

## 2. One user's live flow

1. The publisher opens the tracking link. The system stores the click and sends the user to the advertiser.
2. The advertiser hits our postback URL on each step, with `click_id` and `event`.
3. **`install` arrives.** It is written to the event log. It is not a conversion. The cap does not move. The publisher receives a callback: `event=install`, `payout=0`. This callback is still sent if the click is older than 1 hour.
4. **`registration` arrives.** Same as install. A separate event log, no conversion, and the publisher receives `event=registration`.
5. **`first_deposit` arrives, and the click is inside 1 hour.** This is the conversion.
   - Revenue is 20. Payout is 12.
   - The offer cap and the publisher cap apply only to this event.
   - At 100% approval the status is `approved`.
   - The publisher receives: `event=first_deposit`, `payout=12`, `status=approved`.
6. If the advertiser sends `amount=25`, revenue for that hit becomes 25. Publisher payout stays 12. `amount` is not a percentage of payout.

## 3. What does not go through

- **The event is not on the offer.** If `purchase` arrives and it is not in the list, it is declined. Payout is 0, there is no conversion, the cap does not move, and the publisher is not called. The event log shows it as declined.
- **The same event again.** `install` counts once per click. A second one is a duplicate. If "allow multiple" is on for `deposit`, each deposit can count separately.
- **Primary arrives after 1 hour.** The conversion is `click_expired`, payout is 0, and the publisher is not called. Funnel events are not limited by this window.
- **The cap is full.** The next `first_deposit` has payout 0, status `rejected_cap`, and the publisher is not called. Conversions that were already approved stay approved. `install` and `registration` still come in after the cap is full.

## 4. Offers that have no events

An offer with no events saved stays on the old rule: one click, one conversion. Dedup, payout, caps, approval, and the 1-hour expiry stay as they are today. The event list starts only after at least one event is saved on that offer.

## Please confirm

- The exact event names the advertiser will send, and which single one is billable.
- Revenue and publisher payout for each event.
- Funnel events should be sent to the publisher with no payout, even when the click is older than 1 hour.
- The billable event is sent to the publisher only inside 1 hour, and only when the status is `approved`.
- The cap applies only to the billable event.
- The publisher receives every event on one URL and tells them apart with the `event` parameter.
