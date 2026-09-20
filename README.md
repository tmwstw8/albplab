# Montaj Hattı Araştırma Uygulamaları

Bu çalışma alanında iki bağımsız uygulama bulunur:

- **Kara, Özcan ve Peker (2006):** `http://127.0.0.1:4173/kara/index.html`
- **Manavizadeh, Rabbani ve Radmehr (2015):** `http://127.0.0.1:4173/manavizadeh/index.html`

Ana adres Kara (2006) uygulamasına yönlenir. Her uygulamanın arayüzü, çözücüsü, worker dosyası ve örnek verileri kendi klasöründedir.

## Manavizadeh 2015 MMAL Laboratuvarı

Bağımlılıksız yerel web uygulaması, Manavizadeh, Rabbani ve Radmehr'in (2015) karma modelli montaj hattı dengeleme ve sıralama yaklaşımını deneyebilmek için hazırlanmıştır. Önceki uygulamadan yalnız görsel dil, saklanan sonuçlar, sürekli hesaplama, SVG istasyon görünümü ve atama tablosu korunmuştur; hesap modeli Kara vd. yöntemini kullanmaz.

## Çalıştırma

```powershell
npm start
```

Ardından `http://127.0.0.1:4173` adresini açın. Testler için:

```powershell
npm test
```

## Uygulanan model

- `x(j,k)`: görev `j` istasyon `k`'ya atanır.
- `y(i,m)`: sıra pozisyonu `i` model `m`'yi içerir.
- `z1`: `t(j,m) × a(j,k) × a(i,m)` toplamıyla çevrim amacı.
- `z2`: `z(j,k) × beta(i,m)` toplamıyla fire amacı.
- `z3`: `rho × dengeleme aşımı + (1-rho) × sıralama utility işi`.
- Model taleplerinden en küçük parça kümesi (MPS) ve `gamma = T / (I × J)` otomatik hesaplanır.
- Her istasyona en az `LB` görev atanır; model bazındaki teorik çevrim sınırları `C(m) = T(m) / d(m)` ile türetilir. JSON'daki `cycleLimits` alanı verilirse bu sınırlar açıkça değiştirilebilir.

Çözücü, makalenin dört adımlı fikrini hesaplanabilir hale getirir: üç tek-amaç çözümü ve bir ağırlıklı çok-amaç çözümü üretir; tüm `x/y` çözümlerini üç amaçta yeniden değerlendirir; çok-amaç başlangıcını domine eden gruplara öncelik verir ve kalan adayları normalize sapmayla sıralar. Aday tablosu bu seçimi ve çok-amaç çözümüne göre yüzde değişimleri açıklar.

## Örnekler ve veri kapsamı

`article-teaching-example.json`, makaledeki ilk küçük deneyin 9 ürün, 10 görev, 3 model ve 4 istasyon desenini kullanır. Makale görev süreleri ile `a(j,k)`, `z(j,k)`, `a(i,m)` ve `beta(i,m)` tablolarını yayımlamadığı için bu dosyadaki katsayılar şeffaf biçimde **öğretim verisi** olarak oluşturulmuştur; makalenin Tablo 1 değerlerini yeniden ürettiği iddia edilmez.

`verification-example.json`, formülleri elle kontrol etmeye uygun küçük bir örnektir. Tüm süre ve katsayı hücreleri arayüzde düzenlenebilir; JSON içe aktarma ile gerçek deney verileri yüklenebilir.

## JSON özeti

```json
{
  "problem": {
    "name": "Örnek",
    "lineType": "u",
    "stationCount": 2,
    "minimumTasks": 1,
    "speed": 1,
    "lineLength": 18,
    "rho": 0.5,
    "models": [{"id":"A","demand":2},{"id":"B","demand":1}],
    "tasks": [{
      "id": "1",
      "times": {"A":4,"B":5},
      "stations": [{"rate":0.8,"waste":0.5},{"rate":1.2,"waste":1.5}]
    }],
    "positions": [{
      "A":{"rate":0.9,"waste":0.9},
      "B":{"rate":1.1,"waste":1.1}
    }]
  }
}
```

## Sonuçlar

- Her tohum için saklanan `z1`, `z2`, `z3` sonuçları ve sürekli hesaplama.
- U-hat veya düz hat için indirilebilir SVG istasyon dizilimi.
- Görevler, model yükleri, teorik çevrim sınırları ve istasyon katsayılarını içeren atama tablosu.
- Dört aday çözüm grubunun uygunluk, baskınlık, iyileşme ve normalize sapma karşılaştırması.
- Sabit tohumla tekrarlanabilir Web Worker tabanlı arama.
