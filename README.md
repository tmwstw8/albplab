# ALBP Lab

Bu çalışma alanında dört bağımsız uygulama bulunur:

- **Kara, Özcan ve Peker (2006):** `http://127.0.0.1:4173/kara/index.html`
- **Manavizadeh, Rabbani ve Radmehr (2015):** `http://127.0.0.1:4173/manavizadeh/index.html`
- **Zengin crossover algoritması:** `http://127.0.0.1:4173/zengin/index.html`
- **ALBP çoklu sezgisel hesaplayıcı:** `http://127.0.0.1:4173/albp/index.html`

Ana adres çoklu sezgisel ALBP hesaplayıcısına yönlenir. Her uygulamanın arayüzü, çözücüsü, worker dosyası ve örnek verileri kendi klasöründedir.

## ALBP Çoklu Sezgisel Hesaplayıcı

Kara (2006) uygulamasının veri modeli, Web Worker altyapısı, U-hattı görünümü ve iş yükü matrisi korunarak Simulated Annealing, Genetic Algorithm ve Variable Neighborhood Search aynı ekranda çalıştırılır. Üç yöntem de aynı başlangıç çözümünü, `K−1` komşu-istasyon birleştirme döngüsünü, öncelik ve çevrim uygulanabilirliğini, ön/arka istasyon atamasını, MPS sırasını, `Kb` faz hesabını ve ADW hesabını kullanır. Yalnızca uygulanamaz azaltılmış çözümü onaran iç sezgisel değişir.

- **SA:** Kara'nın `p1`, `p2`, `p3`, `T0`, `Tmin`, `IT`, `R` ve güvenlik sınırıyla Metropolis kabulü.
- **GA:** Zhan ve Zhang (2013) varsayılanlarıyla popülasyon, dengeleme ve sıra çaprazlamaları, iki mutasyon türü, turnuva, elitizm ve durgunluk sınırı. Sabit istasyon sayısı istemez; her görev için tek istasyonlu uygulanabilir çözümden başlayıp ortak `K−1` döngüsünde ilerler.
- **VNS:** dengeleme swap/insert, sıra swap/insert ve isteğe bağlı lane-flip komşulukları; shake, yerel iniş ve kötüleşen merkeze geçebilme davranışı.

Serbest lane ataması ve fiziksel U-rota tutarlılığı varsayılan olarak açıktır. Arama maliyeti varsayılan olarak yalnız ADW'dir; isteğe bağlı `ADW + λ × aşım` cezası açılabilir. Kullanıcı toplam bağımsız hesap sayısını belirler; koşular önce bütün SA, sonra GA, ardından VNS olacak şekilde bloklar halinde yürütülür. Adaylar ortak solution pool içinde tekilleştirilir; filtreler havuzun üstündedir ve tablo tüm metriklerde sıralanabilir.

Çözüm havuzu; problem ve arama parametreleri, bütün koşular ve adaylar, filtre/sıralama durumu, seçili çözüm ve yakınsama grafiğiyle birlikte sürümlü JSON arşivi olarak dışa/içe aktarılabilir. Büyük havuzlar, tarayıcı belleğinde ikinci bir dev JSON kopyası oluşturmadan parça parça yazılır; worker aktarımı için en iyi adaylar sınırlı tutulur. İçe aktarma yeniden arama yapmadan U-hattı yerleşimi ile iş yükü matrisini çözüm verisinden kurar.

## Zengin Crossover SA Laboratuvarı

Yeni araştırma aracı, önce istasyon sayısı ve uygulanabilirliği koruyup crossover kullanımını iki ayrı boyutta inceler:

- **Crossover quantity:** Ön ve arka tarafta en az bir görev bulunan istasyonların sayısı, `N_CW`.
- **Crossover quality:** Her crossover istasyonu için `CB_j = 2 min(WF_j, WB_j) / (WF_j + WB_j)`. `175/5` yük dağılımı düşük, `90/90` dağılımı tam kalite alır.
- **Birleşik amaç:** `wq × N_CW + wb × ΣCB_j − wa × ADW`. Ağırlıklar arayüzden değiştirilerek crossover sayısı yükseltilirken ortalama ve toplam kalitenin nasıl değiştiği deney tablosunda gözlenebilir.

Araç; sürekli farklı tohumlarla hesaplama, sıralanabilir sonuç arşivi, quantity/quality yakınsama grafiği, kalite etiketli SVG üreticisi ve istasyon bazında ön/arka yük tablosu içerir.

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
