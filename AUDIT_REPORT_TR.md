# CryptoSignal Android V0.7 — Denetim Raporu

## Kapsam
V0.6 kaynak ağacı ayrı bir çalışma kopyasına alınarak V0.7 geliştirildi. Önceki kaynak dizini değiştirilmedi. Uygulama Binance Spot public market-data akışını kullanır; API anahtarı, emir endpoint'i veya otomatik işlem kodu eklenmedi.

## Eklenenler
- 1m mum geçmişi ve canlı kapanmış 1m mum akışı.
- Aday seçimiyle açılan mum grafiği; destek/direnç çizgileri.
- EMA20/EMA50, RSI, ATR, 1m momentum ve 1m/5m hacim genişlemesi.
- Çift tepe/dip, simetrik üçgen, yatay sıkışma, boğa/ayı yutan mum, çekiç/kayan yıldız tipi fitil ve iç bar sezgisel işaretleri.
- Senaryo amaçlı alış izleme bandı, stop/geçersizlik, iki hedef ve risk/getiri tahmini.
- Pump baskısı için 0–100 göreli radar puanı. Bu değer pump olasılığı değildir.
- Motor sinyallerinde kaynak mum kapanış zamanını kullanma ve güncel olmayan olayları eleme.
- Binance stream sayısı 7 akış/sembol olacak şekilde yeniden bölündü; her soket en çok 240 stream hedefini aşmaz.

## Testler
- `node --test tests/*.test.js`: **27/27 geçti**.
- `node --check` ile tüm `www/*.js` dosyaları: başarılı.
- `package.json` ve `capacitor.config.json` JSON parse: başarılı.
- ZIP bütünlüğü: paketleme sırasında kontrol edilecek.

## Korunan kurallar
- Spot-only aday oylaması.
- Motor 5 eşikleri: min score 7, 24h quote volume 1M, max spread 35 bps, min move 0.35%, volume z 3, imbalance 0.20.
- Motor 1 eşikleri: 5M 24h quote volume, 3x hacim ve %1.5 fiyat hareketi; mikro aday için 30k USDT 10s notional, skor 50/72.
- Motor 2: RSI 4h 45–72, fiyat EMA50 üstü, MACD bullish 1h, hacim >= 1.3x.
- Motor 3 ve Motor 4 Spot konsensüsüne oy vermez.

## Açık doğrulama maddeleri
Bu çalışma ortamında gerçek Binance WebSocket/REST oturumu, Android cihaz, uzun süreli bağlantı, bellek/batarya ve gerçek piyasa formasyon doğruluğu test edilemedi. APK derlenmedi. GitHub Actions workflow dosyası kaynak pakete dahildir; workflow başarılı olmadan APK hazır denemez.

## Finansal güvenlik
Formasyon tespiti sezgiseldir ve teyitsiz olabilir. Pump baskısı puanı olasılık tahmini değildir. Alış/stop/hedef seviyeleri teknik senaryodur; emir değildir. Ani pump/dump, spread açılması, kayma, likidite çekilmesi ve yanlış kırılım riski devam eder.
