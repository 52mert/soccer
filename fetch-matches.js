import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

// İŞTE HAYAT KURTARAN ÇEVİRMEN SÖZLÜK
// Sol taraf: API'nin gönderdiği isim | Sağ taraf: Senin veritabanındaki isim
const teamMapping = {
    "Fenerbahce": "Fenerbahçe",
    "Besiktas": "Beşiktaş",
    "Istanbul Basaksehir": "Başakşehir",
    "Kasimpasa": "Kasımpaşa",
    "Galatasaray": "Galatasaray",
    "Trabzonspor": "Trabzonspor",
    "Kayserispor": "Kayserispor",
    "Alanyaspor": "Alanyaspor",
    "Antalyaspor": "Antalyaspor",
    "Kocaelispor": "Kocaelispor",
    "Genclerbirligi": "Gençlerbirliği",
    "Goztepe": "Göztepe",
    "Sivasspor": "Sivasspor",
    "Konyaspor": "Konyaspor",
    "Rizespor": "Rizespor",
    "Samsunspor": "Samsunspor",
    "Gaziantep": "Gaziantep FK",
    "Hatayspor": "Hatayspor",
    "Adana Demirspor": "Adana Demirspor",
    "Bodrumspor": "Bodrumspor",
    "Eyupspor": "Eyüpspor"
};

// API ismini senin veritabanı ismine çeviren ufak fonksiyon
const getDbName = (apiName) => {
    return teamMapping[apiName] || apiName;
};

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        const todayStr = new Date().toLocaleString("en-CA", {timeZone: "Europe/Istanbul"}).split(',')[0];
        
        // API'den 2025 sezonunu (güncel sezon) çekiyoruz
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${todayStr}&season=2025&timezone=Europe/Istanbul`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            return res.status(200).json({ message: "Bugün için planlanan maç bulunamadı." });
        }

        // --- BÖLÜM A: GÜNLÜK VİTRİN ---
        await supabase.from('daily_matches').delete().lt('match_date', todayStr + 'T00:00:00Z');

        const vitrinData = allMatches.map(m => ({
            match_id: m.fixture.id,
            home_name: getDbName(m.teams.home.name), // Vitrine de Türkçe isimle yazıyoruz
            away_name: getDbName(m.teams.away.name),
            home_logo: m.teams.home.logo,
            away_logo: m.teams.away.logo,
            home_score: m.goals.home,
            away_score: m.goals.away,
            status_short: m.fixture.status.short,
            elapsed: m.fixture.status.elapsed,
            match_date: m.fixture.date
        }));
        await supabase.from('daily_matches').upsert(vitrinData);

        // --- BÖLÜM B: ANA DEPO (matches) SÖZLÜKLÜ GÜNCELLEME ---
        const superLigMatches = allMatches.filter(m => m.league.id === 203);
        
        for (const m of superLigMatches) {
            const activeOrFinished = ['1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT', 'FT', 'AET', 'PEN'];
            
            if (activeOrFinished.includes(m.fixture.status.short)) {
                // API isimlerini Çevirmenden geçirip Supabase'e yolluyoruz
                const dbHomeName = getDbName(m.teams.home.name);
                const dbAwayName = getDbName(m.teams.away.name);

                await supabase.from('matches')
                    .update({ 
                        home_score: m.goals.home,
                        away_score: m.goals.away,
                        status: m.fixture.status.short 
                    })
                    .eq('league_id', 203)
                    .eq('season', '2025') 
                    .eq('home_team_name', dbHomeName) // Artık 'Başakşehir' olarak arayacak!
                    .eq('away_team_name', dbAwayName); 
            }
        }

        // --- BÖLÜM C: İSTATİSTİK DEPOSU ---
        const bigThreeIds = [19, 543, 648]; 
        let selectedMatches = allMatches.sort((a, b) => {
            const getPriorityScore = (m) => {
                if (bigThreeIds.includes(m.teams.home.id) || bigThreeIds.includes(m.teams.away.id)) return 1;
                if (m.league.id === 203) return 2;
                if ([39, 140, 135, 78, 61].includes(m.league.id)) return 3;
                return 4;
            };
            return getPriorityScore(a) - getPriorityScore(b);
        }).slice(0, 3);

        const activeStatuses = ['1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT'];

        for (const match of selectedMatches) {
            if (activeStatuses.includes(match.fixture.status.short)) {
                const detailRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${match.fixture.id}`, {
                    headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
                });
                const detailJson = await detailRes.json();
                
                if (detailJson.response && detailJson.response.length > 0) {
                    const m = detailJson.response[0];
                    await supabase.from('selected_matches').upsert({
                        match_id: m.fixture.id,
                        stats: m.statistics,
                        events: m.events,
                        updated_at: new Date()
                    });
                }
            }
        }

        return res.status(200).json({ message: "Sözlük devreye girdi, Türkçe karakter uyumsuzluğu aşıldı ve MS mühürlendi!" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
