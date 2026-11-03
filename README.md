# CryptoSignal Android — V0.7 source

Binance Spot-only, read-only radar. No API key, no order endpoint, no automatic trading.

## V0.7 additions
- Closed 1m + 5m + 1h + 4h candles (1h/4h only for the configured Motor 2 universe).
- Interactive candidate selection and a mobile candlestick chart with support/resistance overlays.
- Technical summary: EMA20/EMA50, RSI, ATR, short-term 1m momentum and volume expansion.
- Heuristic pattern flags: double top/bottom, converging triangle, horizontal compression, engulfing candles, hammer/shooting-star type wicks, inside bar.
- Scenario-only entry watch zone, invalidation/stop level, target levels and risk/reward estimate.
- Separate pump-pressure score (0–100 ranking index, **not a probability**). It combines short-timeframe momentum, 1m/5m volume expansion, RSI zone, EMA positioning and proximity to resistance.
- Stale motor events are timestamped from their closed source candle; Motor 1/5 thresholds and Motor 5 strict configuration remain unchanged.

## Important interpretation limits
- Chart patterns are heuristic detections, not guaranteed pattern recognition. They are labelled as possible/unconfirmed unless a separately implemented breakout condition is met.
- The displayed entry/stop/target levels are analytical scenarios, not personalized investment advice or executable orders. Do not treat an entry zone as a buy instruction; wait for confirmation and account for fees/slippage.
- Pump-pressure score is a relative radar index, not a statistically calibrated pump probability or forecast of time-to-pump. A high score can still fail and can precede a sharp reversal.
- Support/resistance uses recent 5m pivot clusters. It is not order-book liquidity mapping and can change as new candles close.
- The 1m impulse metric needs enough closed 1m candles; immediately after app start it can show as unavailable until history loads.
- Motor 3 Linear events and Motor 4 derivatives context are intentionally excluded from the Spot consensus score. Motor 5 thresholds are unchanged.

## Tests
Run `npm test`. V0.7 source test suite: 27 tests, all passing at packaging time. JavaScript syntax checks and JSON parse checks also passed.

## Build APK
Push this source to a GitHub repository and run the included GitHub Actions workflow (`Build CryptoSignal Android APK`) manually, or push to `main`. Download the `cryptosignal-debug-apk` artifact from the successful workflow run.

This package is source code, not an APK. No real Binance live-session validation, Android device installation test, battery/long-duration test, or signed release build has been performed in this environment. The APK must be installed and tested on a physical device before relying on it.
