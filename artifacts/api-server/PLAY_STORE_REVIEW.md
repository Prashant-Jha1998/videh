# Google Play — reviewer login (Videh)

Enable on the **API server** (production env where `videh.co.in` points):

```env
PLAY_STORE_DEMO_ENABLED=1
PLAY_STORE_DEMO_PHONE=9999999999
PLAY_STORE_DEMO_OTP=123456
```

Restart / redeploy the API after changing env.

## Credentials for Play Console

In **Play Console → Your app → Policy → App content → App access**, choose that login is required and paste:

```
Phone (India +91): 9999999999
OTP: 123456

Steps:
1. Open Videh → enter mobile 9999999999 → Continue
2. Tap Send OTP (no real SMS is sent for this test number)
3. Enter OTP 123456 → Verify
4. Complete profile if prompted, then use chats/calls as normal
```

## Notes

- Demo number skips SMS, rate limits, and OTP lockout.
- Use a **dedicated** test number (not a real user). Default `9999999999` is reserved for review.
- To disable after review, set `PLAY_STORE_DEMO_ENABLED=0` or remove the env vars.
