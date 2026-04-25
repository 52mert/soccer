import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Çevresel değişkenlerden (Environment Variables) güvenli bağlantı anahtarlarını alıyoruz
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API_KEY = process.env.API_SPORTS_KEY; 
const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req, res) {
    // 1. GÜVENLİK KONTROLÜ: Sadece Cron Job bu endpoint'i tetikleyebilir
    if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    try {
        // 2. API'DEN VERİ ÇEKME: Bugünün tarihindeki maçları getir
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch("https://v3.football.api-sports.io/fixtures?date=" + today, {
            headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": "v3.football.api-sports.io" }
        });
        const json = await response.json();
        const allMatches = json.response;

        if (!allMatches || allMatches.length === 0) {
            return res.status(200).json({ message: "Bugün için veri bulunamadı veya API limiti doldu." });
        }

        // ---------------- 1. AŞAMA: TEMİZLİK DÖNGÜSÜ ----------------
        // Dünün maçlarını daily_matches ve selected_matches tablolarından siliyoruz
        // match_id'si 0'dan büyük olan her şeyi silerek tabloyu sıfırlamış oluyoruz
        await supabase.from('daily_matches').delete().gt('match_id', 0);
        await supabase.from('selected_matches').delete().gt('match_id', 0);

        // ---------------- 2. AŞAMA: GÜNLÜK MAÇLARI EKLEME ----------------
        // Sadece bugünün maçlarını daily_matches tablosuna ekliyoruz
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

        // ---------------- 3. AŞAMA: ANA FİKSTÜR (MATCHES) GÜNCELLEMESİ ----------------
        // Sadece bitmiş olan statüleri belirliyoruz
        const finishedStatuses = ['FT', 'AET', 'PEN'];
        
        // Sadece Lig ID'si 203 (Süper Lig) olan ve bitmiş maçları filtreliyoruz
        const finishedSuperLigMatches = allMatches.filter(m => 
            finishedStatuses.includes(m.fixture.status.short) && 
            m.league.id === 203
        );

        // Katı kurallarına göre ana matches tablosunu güvenli bir şekilde güncelliyoruz
        for (const m of finishedSuperLigMatches) {
            await supabase
                .from('matches')
                .update({
                    home_score: m.goals.home ?? 0,
                    away_score: m.goals.away ?? 0,
                    status: m.fixture.status.short 
                })
                .eq('id', m.fixture.id)                     // 1. Kural: ID'ler birebir aynı olmalı
                .eq('league_id', 203)                       // 2. Kural: Lig kesinlikle 203 olmalı
                .eq('season', '2025')                       // 3. Kural: Sezon 2025 olmalı
                .eq('status', 'NS')                         // 4. Kural: Veritabanında şu an oynanmamış (NS) görünmeli
                .eq('home_team_name', m.teams.home.name)    // 5. Kural: Ev sahibi adı API ile aynı olmalı
                .eq('away_team_name', m.teams.away.name);   // 6. Kural: Deplasman adı API ile aynı olmalı
        }

        // ---------------- 4. AŞAMA: "GÜNÜN MAÇI" SEÇİMİ ----------------
        // Belirlediğin öncelikli liglere göre ilk 3 maçı vitrin için ayırıyoruz
        const priorityLeagues = [203, 39, 140, 135, 78, 61]; 
        let selected = allMatches
            .sort((a, b) => {
                const aPriority = priorityLeagues.indexOf(a.league.id) === -1 ? 999 : priorityLeagues.indexOf(a.league.id);
                const bPriority = priorityLeagues.indexOf(b.league.id) === -1 ? 999 : priorityLeagues.indexOf(b.league.id);
                return aPriority - bPriority;
            })
            .slice(0, 3);

        // ---------------- 5. AŞAMA: SEÇİLEN MAÇLARIN DETAYLARINI KAYDETME ----------------
        // Sadece bu 3 maç için API'ye tekrar istek atıp detaylı istatistiklerini alıyoruz
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
                });
            }
        }

        return res.status(200).json({ message: "Sistem başarıyla güncellendi: Temizlik yapıldı, skorlar işlendi, vitrin güncellendi!" });

    } catch (err) {
        console.error("Backend Hatası:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
