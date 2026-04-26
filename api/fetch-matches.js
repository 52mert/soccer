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
        // 1. KRİTİK ADIM: Türkiye'nin takvim tarihini (YYYY-MM-DD) alıyoruz
        const trToday = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'Europe/Istanbul', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).format(new Date());

        console.log(`1. Türkiye Tarihi: ${trToday} için API'ye istek atılıyor...`);

        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${trToday}&timezone=Europe/Istanbul`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        
        // rawMatches o güne ait tüm maçlardır (00:00'dan 23:59'a kadar)
        const rawMatches = json.response;

        if (!rawMatches || rawMatches.length === 0) {
            console.log("UYARI: API maç listesi boş döndü! İşlem durduruluyor.");
            return res.status(200).json({ message: "Veri bulunamadı veya API limiti doldu.", detay: json });
        }

        // 2. KRİTİK ADIM: Sadece Öğlen 12 ile Gece Yarısı (24:00) arasındaki maçları vitrin ve liste için ayırıyoruz
        const filteredMatches = rawMatches.filter(m => {
            const matchDate = new Date(m.fixture.date);
            const trHour = parseInt(matchDate.toLocaleString('tr-TR', { 
                timeZone: 'Europe/Istanbul', 
                hour: '2-digit', 
                hour12: false 
            }));
            return trHour >= 12 && trHour < 24;
        });

        console.log(`2. Toplam ${rawMatches.length} maçtan ${filteredMatches.length} tanesi (12:00-00:00) saat kriterine uydu.`);

        // ---------------- 1. AŞAMA: TEMİZLİK DÖNGÜSÜ ----------------
        await supabase.from('daily_matches').delete().gt('match_id', 0).throwOnError();
        await supabase.from('selected_matches').delete().gt('match_id', 0).throwOnError();
        
        console.log("3. Temizlik bitti. Filtrelenen veriler daily_matches tablosuna ekleniyor...");

        // ---------------- 2. AŞAMA: GÜNLÜK MAÇLARI EKLEME (Sadece 12:00-24:00 arası maçlar) ----------------
        const dailyData = filteredMatches.map(m => ({
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

        if (dailyData.length > 0) {
            await supabase.from('daily_matches').upsert(dailyData).throwOnError();
        }

        console.log("4. Daily matches güncellendi. Ana Fikstür (matches) kontrolü başlıyor...");

        // ---------------- 3. AŞAMA: ANA FİKSTÜR (MATCHES) GÜNCELLEMESİ ----------------
    // ---------------- 3. AŞAMA: ANA FİKSTÜR (MATCHES) CANLI GÜNCELLEMESİ ----------------
        // API'den gelen ve veritabanında güncellenmemesi GEREKEN statüler (NS = Başlamadı, PST = Ertelendi, CANC = İptal)
        const ignoredStatuses = ['NS', 'PST', 'CANC', 'TBD'];
        
        // rawMatches (o günün tüm maçları) içinden sadece 203 (Süper Lig) olan ve "başlamış/bitmiş" olanları seçiyoruz
        const activeOrFinishedMatches = rawMatches.filter(m => 
            m.league.id === 203 && !ignoredStatuses.includes(m.fixture.status.short)
        );

        // İSİM ÇEVİRİ SÖZLÜĞÜ (Aynen kalıyor)
        const takimSozlugu = {
            "Rizespor": "Ç.Rizespor",
            "Fenerbahce": "Fenerbahçe",
            "Besiktas": "Beşiktaş",
            "Gaziantep": "Gaziantep FK",
            "Istanbul Basaksehir": "Başakşehir", 
            "Alanyaspor": "Corendon Alanyaspor" ,
            "Gençlerbirliği S.K.":"Gençlerbirliği"
        };

        const cevir = (apiIsmi) => takimSozlugu[apiIsmi] || apiIsmi; 

        console.log(`5. Güncellenebilecek Canlı/Bitmiş Süper Lig maçı sayısı: ${activeOrFinishedMatches.length}`);

        for (const m of activeOrFinishedMatches) {
            const dbHomeName = cevir(m.teams.home.name);
            const dbAwayName = cevir(m.teams.away.name);

            // KRİTİK: Eğer maç bitmişse (FT, AET, PEN), elapsed değerini sıfırla (null yap).
            // Eğer maç hala oynanıyorsa API'den gelen dakikayı (m.fixture.status.elapsed) yaz.
            const isFinished = ['FT', 'AET', 'PEN'].includes(m.fixture.status.short);
            const currentElapsed = isFinished ? null : (m.fixture.status.elapsed ?? null);

            await supabase
                .from('matches')
                .update({
                    home_score: m.goals.home ?? 0,
                    away_score: m.goals.away ?? 0,
                    status: m.fixture.status.short, // Artık 1H, HT, 2H veya FT yazacak
                    elapsed: currentElapsed         // Canlıysa dakika (örn: 75), bittiyse NULL
                })
                .eq('league_id', 203)
                .eq('season', '2025')
                // DİKKAT: .eq('status', 'NS') kısmını SİLDİK. 
                // Çünkü maç "1H" iken "2H" olarak güncellenmesi veya skorun değişmesi gerekebilir!
                .eq('home_team_name', dbHomeName)  
                .eq('away_team_name', dbAwayName)  
                .throwOnError();
        }

        console.log("6. Vitrin (selected_matches) seçimleri yapılıyor...");
        // ---------------- 4. AŞAMA: AKILLI "GÜNÜN MAÇI" SEÇİMİ ----------------
        const getMatchPriority = (match) => {
            const home = match.teams.home.name.toLowerCase();
            const away = match.teams.away.name.toLowerCase();

            // 1. KURAL: 3 Büyükler
            if (home.includes('fenerbah') || away.includes('fenerbah')) return 1;
            if (home.includes('galatasaray') || away.includes('galatasaray')) return 2;
            if (home.includes('besiktas') || home.includes('beşiktaş') || away.includes('besiktas') || away.includes('beşiktaş')) return 3;

            // 2. KURAL: Diğer Süper Lig Maçları
            if (match.league.id === 203) return 10;

            // 3. KURAL: 5 Büyük Lig 
            const top5 = [39, 140, 135, 78, 61];
            if (top5.includes(match.league.id)) {
                return 20 + top5.indexOf(match.league.id);
            }

            // 4. KURAL: Geri kalan tüm sıradan maçlar
            return 100;
        };

        // Vitrini sadece bizim saatlere uyan maçlardan (filteredMatches) seçiyoruz
        let selected = filteredMatches
            .sort((a, b) => getMatchPriority(a) - getMatchPriority(b))
            .slice(0, 3);

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

        console.log("7. İŞLEM BAŞARIYLA TAMAMLANDI! Filtreler uygulandı, skorlar işlendi.");
        return res.status(200).json({ message: "Sistem başarıyla güncellendi!" });

    } catch (err) {
        console.error("KRİTİK HATA OLUŞTU:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
