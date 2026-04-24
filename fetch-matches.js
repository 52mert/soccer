import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Bütün şifreleri .env (Environment Variables) üzerinden güvenle çekiyoruz
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
    // 1. GÜVENLİK KONTROLÜ: Sadece senin Vercel Cron sistemin bu dosyayı çalıştırabilsin
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        // 2. API-Football'dan bugünün maçlarını çek
        const response = await fetch("https://v3.football.api-sports.io/fixtures?date=" + new Date().toISOString().split('T')[0], {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches) throw new Error("API'den veri gelmedi");

        // 3. Veritabanına (daily_matches) tüm maçları kaydet (Upsert)
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

        await supabase.from('daily_matches').upsert(dailyData);

        // 4. 3 Tane "Günün Maçı" Seçme Algoritması
        const priorityLeagues = [203, 39, 140, 135, 78, 61];
        let selected = allMatches
            .sort((a, b) => {
                const aPriority = priorityLeagues.indexOf(a.league.id) === -1 ? 999 : priorityLeagues.indexOf(a.league.id);
                const bPriority = priorityLeagues.indexOf(b.league.id) === -1 ? 999 : priorityLeagues.indexOf(b.league.id);
                return aPriority - bPriority;
            })
            .slice(0, 3);

        // 5. Seçilen 3 Maçın Detaylarını (İstatistik/Olay) Çek ve Kaydet
        for (const match of selected) {
            const detailRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${match.fixture.id}`, {
                headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
            });
            const detailJson = await detailRes.json();
            const m = detailJson.response[0];

            await supabase.from('selected_matches').upsert({
                match_id: m.fixture.id,
                stats: m.statistics,
                events: m.events,
                updated_at: new Date()
            });
        }

        return res.status(200).json({ message: "Sistem başarıyla güncellendi!" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}