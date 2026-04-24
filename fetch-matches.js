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
        // 2. BUGÜNÜN MAÇLARINI ÇEK
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}&season=2025`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            return res.status(200).json({ message: "Bugün için planlanan maç bulunamadı." });
        }

        // DİKKAT: Eski günleri silme kodunu BURADAN KALDIRDIK! 
        // matches tablosu tüm sezonu tuttuğu için asla silinmemeli.

        // 3. BUGÜNÜN MAÇLARINI "matches" TABLOSUNDA GÜNCELLE (Upsert)
        // Oynanan maçların skoru (1H, FT vb.) anında ana fikstüre işlenir.
        const dailyData = allMatches.map(m => ({
            id: m.fixture.id,
            league_id: m.league.id,
            home_team_id: m.teams.home.id,
            away_team_id: m.teams.away.id,
            home_team_name: m.teams.home.name,
            away_team_name: m.teams.away.name,
            home_team_logo: m.teams.home.logo,
            away_team_logo: m.teams.away.logo,
            home_score: m.goals.home, 
            away_score: m.goals.away, 
            status: m.fixture.status.short,
            match_date: m.fixture.date,
            season: '2025'
        }));

        const { error: upsertError } = await supabase.from('matches').upsert(dailyData);
        if (upsertError) throw new Error("Supabase fikstür kayıt hatası: " + upsertError.message);

        // 4. GÜNÜN 3 MAÇINI SEÇME ALGORİTMASI
        const bigThreeIds = [19, 543, 648]; 
        const superLigId = 203;
        const topLeagues = [39, 140, 135, 78, 61]; 

        let selectedMatches = allMatches.sort((a, b) => {
            const getPriorityScore = (m) => {
                const homeId = m.teams.home.id;
                const awayId = m.teams.away.id;
                const leagueId = m.league.id;

                if (bigThreeIds.includes(homeId) || bigThreeIds.includes(awayId)) return 1;
                if (leagueId === superLigId) return 2;
                if (topLeagues.includes(leagueId)) return 3;
                return 4;
            };

            return getPriorityScore(a) - getPriorityScore(b);
        }).slice(0, 3); 

        // 5. API KOTASINI KORUYAN İSTATİSTİK ÇEKİCİ (selected_matches)
        const activeStatuses = ['1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT'];

        for (const match of selectedMatches) {
            const status = match.fixture.status.short;

            if (!activeStatuses.includes(status)) {
                console.log(`Maç ${match.fixture.id} aktif değil (${status}). Kota harcanmadı.`);
                continue; 
            }

            const detailRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${match.fixture.id}`, {
                headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
            });
            const detailJson = await detailRes.json();
            
            if (detailJson.response && detailJson.response.length > 0) {
                const m = detailJson.response[0];

                // İstatistikleri ve olayları ana tabloya (veya selected_matches) yaz
                await supabase.from('matches')
                    .update({ 
                        events: m.events,
                        // stats: m.statistics 
                    })
                    .eq('id', m.fixture.id);
            }
        }

        return res.status(200).json({ 
            message: "Fikstür başarıyla güncellendi (Eski maçlar güvende!)." 
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
