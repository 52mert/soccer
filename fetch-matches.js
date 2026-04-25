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
        console.log("1. API'ye İstek Atılıyor...");
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch("https://v3.football.api-sports.io/fixtures?date=" + today, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        
        // EĞER API LİMİTİ DOLDUYSA VEYA HATA VARSA BURADA GÖRECEĞİZ
        console.log("2. API'den Gelen Cevap Özeti:", JSON.stringify(json).substring(0, 200) + "..."); 

        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            console.log("UYARI: API maç listesi boş döndü! İşlem durduruluyor.");
            return res.status(200).json({ message: "Veri bulunamadı veya API limiti doldu.", detay: json });
        }

        console.log(`3. API'den ${allMatches.length} maç çekildi. Supabase temizliği başlıyor...`);

        // .throwOnError() EKLEDİK: Eğer Supabase'de hata olursa sessiz kalmayıp sistemi durduracak
        await supabase.from('daily_matches').delete().gt('match_id', 0).throwOnError();
        await supabase.from('selected_matches').delete().gt('match_id', 0).throwOnError();
        
        console.log("4. Temizlik bitti. Yeni veriler yükleniyor...");

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

        console.log("5. Daily matches güncellendi. Ana Fikstür kontrolü başlıyor...");

        const finishedStatuses = ['FT', 'AET', 'PEN'];
        const finishedSuperLigMatches = allMatches.filter(m => 
            finishedStatuses.includes(m.fixture.status.short) && 
            m.league.id === 203
        );

        console.log(`6. Güncellenecek Süper Lig maçı sayısı: ${finishedSuperLigMatches.length}`);

        for (const m of finishedSuperLigMatches) {
            await supabase
                .from('matches')
                .update({
                    home_score: m.goals.home ?? 0,
                    away_score: m.goals.away ?? 0,
                    status: m.fixture.status.short 
                })
                .eq('id', m.fixture.id)                     
                .eq('league_id', 203)                       
                .eq('season', '2025')                       
                .eq('status', 'NS')                         
                .eq('home_team_name', m.teams.home.name)    
                .eq('away_team_name', m.teams.away.name)
                .throwOnError();
        }

        console.log("7. Vitrin (Selected Matches) güncelleniyor...");
        const priorityLeagues = [203, 39, 140, 135, 78, 61]; 
        let selected = allMatches
            .sort((a, b) => {
                const aPriority = priorityLeagues.indexOf(a.league.id) === -1 ? 999 : priorityLeagues.indexOf(a.league.id);
                const bPriority = priorityLeagues.indexOf(b.league.id) === -1 ? 999 : priorityLeagues.indexOf(b.league.id);
                return aPriority - bPriority;
            })
            .slice(0, 3);

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

        console.log("8. İŞLEM BAŞARIYLA TAMAMLANDI!");
        return res.status(200).json({ message: "Her şey güncellendi!" });

    } catch (err) {
        // ARTIK BİR HATA OLURSA SESSİZ KALMAYACAK, BURAYA DÜŞECEK
        console.error("KRİTİK HATA:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
