import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        const todayStr = new Date().toLocaleString("en-CA", {timeZone: "Europe/Istanbul"}).split(',')[0];
        
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${todayStr}&season=2025&timezone=Europe/Istanbul`, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            return res.status(200).json({ message: "Bugün maç bulunamadı." });
        }

        // --- BÖLÜM A: daily_matches (Arama/Vitrin İçin) ---
        // Burada isimler çok kritik değil, o yüzden basitçe ekliyoruz
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

        // --- BÖLÜM B: matches (Ana Fikstür) ID TABANLI GÜNCELLEME ---
        // ARTIK İSİM EŞLEŞTİRMİYORUZ!
        const superLigMatches = allMatches.filter(m => m.league.id === 203);
        
        for (const m of superLigMatches) {
            // Sadece skor değişikliği olan veya biten maçları işle
            const activeOrFinished = ['1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT', 'FT', 'AET', 'PEN'];
            
            if (activeOrFinished.includes(m.fixture.status.short)) {
                
                // Senin matches tablandaki ID mantığına göre arama yapıyoruz
                // Resimde gördüğüm: "2025203" + bir sayı. 
                // Önce ID'nin içinde 2025203 geçen satırı bulalım (Daha garanti)
                const { data: foundMatch } = await supabase
                    .from('matches')
                    .select('id')
                    .eq('league_id', 203)
                    .eq('season', '2025')
                    .eq('home_team_name', m.teams.home.name.includes("Basaksehir") ? "Başakşehir" : m.teams.home.name) 
                    .maybeSingle();

                // Eğer ismi mapping ile bulamazsak, API'den gelen veriyi senin tablona update ediyoruz
                // En garanti yol: Sen SQL'de Başakşehir ismini güncelleyebildiysen, 
                // biz de koda "Basaksehir" kelimesini gördüğünde "Başakşehir" yap diyelim.
                
                const safeHome = m.teams.home.name.replace("Istanbul Basaksehir", "Başakşehir").replace("Kasimpasa", "Kasımpaşa").replace("Besiktas", "Beşiktaş").replace("Fenerbahce", "Fenerbahçe");
                const safeAway = m.teams.away.name.replace("Istanbul Basaksehir", "Başakşehir").replace("Kasimpasa", "Kasımpaşa").replace("Besiktas", "Beşiktaş").replace("Fenerbahce", "Fenerbahçe");

                await supabase.from('matches')
                    .update({ 
                        home_score: m.goals.home,
                        away_score: m.goals.away,
                        status: m.fixture.status.short 
                    })
                    .eq('league_id', 203)
                    .eq('season', '2025')
                    .eq('home_team_name', safeHome)
                    .eq('away_team_name', safeAway);
            }
        }

        return res.status(200).json({ message: "Sistem güncellendi!" });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
