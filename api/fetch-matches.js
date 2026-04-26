import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Bütün şifreleri .env (Environment Variables) üzerinden güvenle çekiyoruz
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
    // 1. GÜVENLİK KONTROLÜ
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        console.log("1. API'ye İstek Atılıyor...");
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch("https://v3.football.api-sports.io/fixtures?date=" + today, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            console.log("UYARI: API maç listesi boş döndü! İşlem durduruluyor.");
            return res.status(200).json({ message: "Veri bulunamadı veya API limiti doldu.", detay: json });
        }

        console.log(`2. API'den ${allMatches.length} maç çekildi. Supabase temizliği başlıyor...`);

        // ---------------- 1. AŞAMA: TEMİZLİK DÖNGÜSÜ ----------------
        // Dünün maçlarını siliyoruz (.throwOnError() ile hata olursa çökmesini sağlıyoruz)
        await supabase.from('daily_matches').delete().gt('match_id', 0).throwOnError();
        await supabase.from('selected_matches').delete().gt('match_id', 0).throwOnError();
        
        console.log("3. Temizlik bitti. Bugünün verileri daily_matches tablosuna ekleniyor...");

        // ---------------- 2. AŞAMA: GÜNLÜK MAÇLARI EKLEME ----------------
        const dailyData = allMatches.map(m => ({
            match_id: m.fixture.id,
            league_id: m.league.id,
            home_name: m.teams.home.name,
            away_name: m.teams.away.name,
            home_logo: m.teams.home.logo,
            away_logo: m.teams.away.logo,
            home_score: m.goals.home ?? 0,
            away_score: m.goals.away ?? 0,
            status_short: m.fixture.status.short,
            elapsed: m.fixture.status.elapsed ?? 0,
            match_date: m.fixture.date
        }));

        await supabase.from('daily_matches').upsert(dailyData).throwOnError();

        console.log("4. Daily matches güncellendi. Ana Fikstür (matches) kontrolü başlıyor...");

        // ---------------- 3. AŞAMA: ANA FİKSTÜR (MATCHES) GÜNCELLEMESİ ----------------
        const finishedStatuses = ['FT', 'AET', 'PEN'];
        const finishedSuperLigMatches = allMatches.filter(m => 
            finishedStatuses.includes(m.fixture.status.short) && 
            m.league.id === 203
        );

      // 👇 YENİ EKLENEN KISIM: İSİM ÇEVİRİ SÖZLÜĞÜ 👇
        // Sol taraf: API-Football'un gönderdiği isim (daily_matches'ten bakabilirsin)
        // Sağ taraf: Senin matches tablonda yazan isim
        const takimSozlugu = {
            "Rizespor": "Ç.Rizespor",
            "Fenerbahce": "Fenerbahçe",       // Örnek: API'de ç yoktur, sende vardır
            "Besiktas": "Beşiktaş",           // Örnek
            "Gaziantep": "Gaziantep FK",      // Sen resimde Gaziantep FK yazmışsın, API Gaziantep diyebilir
            "Istanbul Basaksehir": "Başakşehir", 
            "Alanyaspor": "Corendon Alanyaspor" // Eğer sende sponsorlu isim varsa
            // Uyuşmayan diğer takımlarını buraya aynı mantıkla ekle...
        };

        // Bu küçük fonksiyon, isim sözlükte varsa çevirir, yoksa (örn: Eyüpspor) aynen bırakır
        const cevir = (apiIsmi) => takimSozlugu[apiIsmi] || apiIsmi; 
        // 👆 YENİ EKLENEN KISIM BİTTİ 👆


        console.log(`5. Güncellenebilecek potansiyel bitmiş Süper Lig maçı sayısı: ${finishedSuperLigMatches.length}`);

        for (const m of finishedSuperLigMatches) {
            // İsimleri veritabanında aramadan önce sözlükten geçiriyoruz
            const dbHomeName = cevir(m.teams.home.name);
            const dbAwayName = cevir(m.teams.away.name);

            await supabase
                .from('matches')
                .update({
                    home_score: m.goals.home ?? 0,
                    away_score: m.goals.away ?? 0,
                    status: m.fixture.status.short 
                })
                .eq('league_id', 203)
                .eq('season', '2025')
                .eq('status', 'NS')
                .eq('home_team_name', dbHomeName)  // Artık çevrilmiş ismi arıyoruz!
                .eq('away_team_name', dbAwayName)  // Artık çevrilmiş ismi arıyoruz!
                .throwOnError();
        }

        console.log("6. Vitrin (selected_matches) seçimleri yapılıyor...");

        // ---------------- 4. AŞAMA: "GÜNÜN MAÇI" SEÇİMİ ----------------
      console.log("6. Vitrin (selected_matches) seçimleri yapılıyor...");

        // ---------------- 4. AŞAMA: AKILLI "GÜNÜN MAÇI" SEÇİMİ ----------------
        // Maçlara önem derecesine göre puan veren fonksiyon
        const getMatchPriority = (match) => {
            const home = match.teams.home.name;
            const away = match.teams.away.name;

            // 1. KURAL: 3 Büyükler (Öncelik sırasına göre)
            // Not: İsimleri API'nin gönderdiği şekliyle yazıyoruz (İngilizce karakter)
            if (home === 'Fenerbahce' || away === 'Fenerbahce') return 1;
            if (home === 'Galatasaray' || away === 'Galatasaray') return 2;
            if (home === 'Besiktas' || away === 'Besiktas') return 3;

            // 2. KURAL: Diğer Süper Lig Maçları (Hepsi 10 puan alır, kendi aralarında sıralanır)
            if (match.league.id === 203) return 10;

            // 3. KURAL: 5 Büyük Lig (Premier League, La Liga, Serie A, Bundesliga, Ligue 1)
            const top5 = [39, 140, 135, 78, 61];
            if (top5.includes(match.league.id)) {
                return 20 + top5.indexOf(match.league.id); // 20, 21, 22... diye puanlar
            }

            // 4. KURAL: Geri kalan tüm sıradan maçlar
            return 100;
        };

        // Tüm maçları puanlarına göre küçükten büyüğe sırala ve ilk 3'ü al
        let selected = allMatches
            .sort((a, b) => getMatchPriority(a) - getMatchPriority(b))
            .slice(0, 3);

        // ---------------- 5. AŞAMA: SEÇİLEN MAÇLARIN DETAYLARINI KAYDETME (AYNI KALIYOR) ----------------

        // ---------------- 5. AŞAMA: SEÇİLEN MAÇLARIN DETAYLARINI KAYDETME ----------------
        for (const match of selected) {
            const detailRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${match.fixture.id}`, {
                headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
            });
            const detailJson = await detailRes.json();
            const m = detailJson.response[0];

            if (m) {
                await supabase.from('selected_matches').upsert({
                    match_id: m.fixture.id,
                    stats: m.statistics,
                    events: m.events,
                    updated_at: new Date()
                }).throwOnError();
            }
        }

        console.log("7. İŞLEM BAŞARIYLA TAMAMLANDI! Eski veriler silindi, yenileri eklendi, skorlar işlendi.");
        return res.status(200).json({ message: "Sistem başarıyla güncellendi!" });

    } catch (err) {
        console.error("KRİTİK HATA OLUŞTU:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
