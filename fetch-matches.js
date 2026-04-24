import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
    // 1. GÜVENLİK KONTROLÜ
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // 2. API'DEN BUGÜNÜN TÜM MAÇLARINI ÇEK
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}&season=2025`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            return res.status(200).json({ message: "Bugün için planlanan maç bulunamadı." });
        }

        // --- BÖLÜM A: GÜNLÜK VİTRİN (daily_matches) İŞLEMLERİ ---
        // Geçmiş günleri temizle (Sadece Vitrin Tablosu Sıfırlanır)
        await supabase.from('daily_matches').delete().lt('match_date', today);

        // Bugünün tüm maçlarını vitrine ekle (Frontend'deki arama ve listeleme için)
        const vitrinData = allMatches.map(m => ({
            match_id: m.fixture.id,
            home_name: m.teams.home.name,
            away_name: m.teams.away.name,
            home_logo: m.teams.home.logo,
            away_logo: m.teams.away.logo,
            home_score: m.goals.home,
            away_score: m.goals.away,
            status_short: m.fixture.status.short,
            elapsed: m.fixture.status.elapsed,
            match_date: m.fixture.date
        }));

        await supabase.from('daily_matches').upsert(vitrinData);

        // --- BÖLÜM B: ANA DEPO (matches) GÜNCELLEME (SADECE SÜPER LİG 2025) ---
        const superLigMatches = allMatches.filter(m => m.league.id === 203);
        
        if (superLigMatches.length > 0) {
            const archiveData = superLigMatches.map(m => ({
                id: m.fixture.id,
                league_id: m.league.id,
                home_team_name: m.teams.home.name,
                away_team_name: m.teams.away.name,
                home_score: m.goals.home,
                away_score: m.goals.away,
                status: m.fixture.status.short,
                match_date: m.fixture.date,
                season: '2025',
                home_team_logo: m.teams.home.logo,
                away_team_logo: m.teams.away.logo
            }));
            
            // Sadece bu maçları güncelle (Maç sayıları ve goller 'upsert' sayesinde asla çift sayılmaz)
            await supabase.from('matches').upsert(archiveData);
        }

        // --- BÖLÜM C: İSTATİSTİK DEPOSU (selected_matches) ---
        // Günün 3 Maçı Seçimi
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
            // Eğer maç canlıysa istatistik çek
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

        return res.status(200).json({ message: "Sistem senkronizasyonu tamamlandı." });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
