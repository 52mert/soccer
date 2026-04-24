import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

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

const getDbName = (apiName) => teamMapping[apiName] || apiName;

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        const todayStr = new Date().toLocaleString("en-CA", {timeZone: "Europe/Istanbul"}).split(',')[0];
        
        // Sezonu 2025 olarak çekiyoruz (Mersin/Türkiye saati ile 2026'dayız ama lig 2025 sezonu)
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${todayStr}&season=2025&timezone=Europe/Istanbul`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            console.log("API'den maç gelmedi. Tarih:", todayStr);
            return res.status(200).json({ message: "Bugün için maç bulunamadı." });
        }

        // --- daily_matches Güncelleme ---
        await supabase.from('daily_matches').delete().lt('match_date', todayStr);
        const vitrinData = allMatches.map(m => ({
            match_id: m.fixture.id,
            home_name: getDbName(m.teams.home.name),
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

        // --- matches (Ana Fikstür) Nokta Atışı Güncelleme ---
        const superLigMatches = allMatches.filter(m => m.league.id === 203);
        
        for (const m of superLigMatches) {
            const dbHome = getDbName(m.teams.home.name);
            const dbAway = getDbName(m.teams.away.name);

            // KRİTİK DEĞİŞİKLİK: Filtreyi gevşetiyoruz ki hata payı kalmasın
            const { error: updError } = await supabase
                .from('matches')
                .update({ 
                    home_score: m.goals.home,
                    away_score: m.goals.away,
                    status: m.fixture.status.short 
                })
                .eq('league_id', 203)
                .ilike('season', '%2025%') // "2025" içeren her şeyi bul (boşluk varsa bile yakalar)
                .eq('home_team_name', dbHome)
                .eq('away_team_name', dbAway);

            if (updError) console.error("Güncelleme hatası:", dbHome, updError);
        }

        return res.status(200).json({ message: "İşlem tamam, kontrol edildi!" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
