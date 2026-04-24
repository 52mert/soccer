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

        // 3. GEÇMİŞ GÜNLERİ TEMİZLE (Sıfırlama İşlemi)
        // match_date'i bugünden küçük olan (yani düne ve daha eskiye ait) tüm maçları siler.
        // Böylece veritabanın asla şişmez, sadece o günün taze verileri kalır.
        const { error: deleteError } = await supabase
            .from('matches')
            .delete()
            .lt('match_date', today); // "lt" = less than (daha küçük olanlar)

        if (deleteError) {
            console.error("Eski maçları silerken hata oluştu:", deleteError);
        }

        // 4. TÜM MAÇLARI "matches" TABLOSUNA KAYDET (Fikstür Güncellemesi)
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

        // Fikstürü veritabanına yaz (Aynı maç varsa üstüne yazar, yoksa ekler)
        const { error: upsertError } = await supabase.from('matches').upsert(dailyData);
        if (upsertError) throw new Error("Supabase fikstür kayıt hatası: " + upsertError.message);

        // 5. GÜNÜN 3 MAÇINI SEÇME ALGORİTMASI (Puanlama Sistemi)
        const bigThreeIds = [19, 543, 648]; // FB (19), BJK (543), GS (648)
        const superLigId = 203;
        const topLeagues = [39, 140, 135, 78, 61]; // Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1

        let selectedMatches = allMatches.sort((a, b) => {
            const getPriorityScore = (m) => {
                const homeId = m.teams.home.id;
                const awayId = m.teams.away.id;
                const leagueId = m.league.id;

                // Öncelik 1: Büyük Üçlü
                if (bigThreeIds.includes(homeId) || bigThreeIds.includes(awayId)) return 1;
                // Öncelik 2: Diğer Süper Lig Maçları
                if (leagueId === superLigId) return 2;
                // Öncelik 3: Avrupa 5 Büyük Lig
                if (topLeagues.includes(leagueId)) return 3;
                // Öncelik 4: Diğer tüm maçlar (Rastgele gibi sona atılır)
                return 4;
            };

            return getPriorityScore(a) - getPriorityScore(b);
        }).slice(0, 3); // Sadece en tepeye çıkan 3 maçı al

        // 6. API KOTASINI KORUYAN İSTATİSTİK/OLAY ÇEKİCİ
        // Sadece canlı olan maçların istatistikleri çekilir
        const activeStatuses = ['1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT'];

        for (const match of selectedMatches) {
            const status = match.fixture.status.short;

            // Eğer maç başlamadıysa veya bittiyse, pas geç!
            if (!activeStatuses.includes(status)) {
                console.log(`Maç ${match.fixture.id} aktif değil (${status}). Kota harcanmadı.`);
                continue; 
            }

            // Maç canlıysa, detaylı istatistik ve olayları (events) çek
            const detailRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${match.fixture.id}`, {
                headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
            });
            const detailJson = await detailRes.json();
            
            if (detailJson.response && detailJson.response.length > 0) {
                const m = detailJson.response[0];

                // Sadece o maçın olaylarını matches tablosunda güncelle
                await supabase.from('matches')
                    .update({ 
                        events: m.events,
                        // Not: Eğer tablonda "stats" diye bir jsonb sütunu varsa alttaki yorumu kaldırabilirsin:
                        // stats: m.statistics 
                    })
                    .eq('id', m.fixture.id);
            }
        }

        return res.status(200).json({ 
            message: "Eski maçlar temizlendi, yeni fikstür başarıyla senkronize edildi ve canlı istatistikler çekildi." 
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
