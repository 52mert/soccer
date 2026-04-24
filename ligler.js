// 1. Supabase Bağlantısı
const SUPABASE_URL = "https://xozwjuudbypmqewncdoo.supabase.co";
// Publishable Key'i buraya yapıştır kanka
const SUPABASE_KEY = "sb_publishable_XeQN6Ha9dWfJ_SqjLUsx9A_DM-8ld4k"; 

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentLeagueId = null;

// 2. Lige Tıklanınca Çalışan Fonksiyon
async function selectLeague(leagueId) {
    currentLeagueId = leagueId;

    // Görünümü değiştir
    const selectionScene = document.getElementById('leagueSelectionScene');
    const detailScene = document.getElementById('leagueDetailScene');
    
    if(selectionScene) selectionScene.style.display = 'none';
    if(detailScene) detailScene.style.display = 'block';

    // Başlıkları güncelle
    const leagueNames = {
        203: "Trendyol Süper Lig",
        39: "Premier League",
        140: "La Liga",
        78: "Bundesliga",
        135: "Serie A",
        61: "Ligue 1"
    };
    const title = document.getElementById("leagueTitle");
    if(title) title.innerText = leagueNames[leagueId] || "Lig Detayı";

    // Veriyi Çek
    const season = document.getElementById("seasonSelect").value;
    fetchStandings(leagueId, season);
}

// 3. Veri Çekme Motoru
// 3. Veri Çekme Motoru (Algoritmik Versiyon)
async function fetchStandings(leagueId, season) {
    const tbody = document.getElementById("standingBody");
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">🔄 Yükleniyor...</td></tr>';

    let finalData = [];

    // --- PROFESYONEL HESAPLAMA MOTORU (Tüm Seneler ve Ligler İçin) ---
    // Artık sadece 2025 değil, matches tablosunda verisi olan her şey için çalışır
    console.log(`${leagueId} ligi ${season} sezonu hesaplanıyor...`);
    
    const { data: matches, error: matchError } = await _supabase
        .from('matches')
        .select('*')
        .eq('league_id', leagueId)
        .eq('season', String(season))
        .eq('status', 'FT'); // Sadece bitmiş maçlar

    // Eğer matches tablosunda bu yıla ait veri varsa hesapla
    if (!matchError && matches && matches.length > 0) {
        let hesaplananTablo = {};

        matches.forEach(mac => {
            if (!hesaplananTablo[mac.home_team_name]) {
                hesaplananTablo[mac.home_team_name] = { 
                    takim_adi: mac.home_team_name, 
                    logo: mac.home_team_logo, // Logoyu buradan alıyoruz
                    om: 0, g: 0, b: 0, m: 0, puan: 0, averaj: 0 
                };
            }
            if (!hesaplananTablo[mac.away_team_name]) {
                hesaplananTablo[mac.away_team_name] = { 
                    takim_adi: mac.away_team_name, 
                    logo: mac.away_team_logo, // Logoyu buradan alıyoruz
                    om: 0, g: 0, b: 0, m: 0, puan: 0, averaj: 0 
                };
            }

            hesaplananTablo[mac.home_team_name].om++;
            hesaplananTablo[mac.away_team_name].om++;
            hesaplananTablo[mac.home_team_name].averaj += (mac.home_score - mac.away_score);
            hesaplananTablo[mac.away_team_name].averaj += (mac.away_score - mac.home_score);

            if (mac.home_score > mac.away_score) {
                hesaplananTablo[mac.home_team_name].g++;
                hesaplananTablo[mac.away_team_name].m++;
                hesaplananTablo[mac.home_team_name].puan += 3;
            } else if (mac.home_score < mac.away_score) {
                hesaplananTablo[mac.away_team_name].g++;
                hesaplananTablo[mac.home_team_name].m++;
                hesaplananTablo[mac.away_team_name].puan += 3;
            } else {
                hesaplananTablo[mac.home_team_name].b++;
                hesaplananTablo[mac.away_team_name].b++;
                hesaplananTablo[mac.home_team_name].puan += 1;
                hesaplananTablo[mac.away_team_name].puan += 1;
            }
        });

        finalData = Object.values(hesaplananTablo).sort((a, b) => {
            if (b.puan === a.puan) return b.averaj - a.averaj;
            return b.puan - a.puan;
        });
    } 
    // --- FALLBACK: Eğer matches boşsa eski statik tabloya bak ---
    else {
        let { data, error } = await _supabase
            .from('lig_siralamasi')
            .select('*')
            .eq('lig_id', String(leagueId)) 
            .eq('sezon', String(season))
            .order('puan', { ascending: false });

        if (!error) finalData = data;
    }

    // --- EKRANA BASTIRMA ---
    if (!finalData || finalData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center">⚠️ ${season} sezonu verisi bulunamadı.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    finalData.forEach((team, index) => {
        // Logo önceliği: Hesaplanan tablodan gelen logo veya statik tablodaki logo
        const teamLogo = team.logo || team.takim_logo || 'https://via.placeholder.com/24?text=?';

        tbody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td style="text-align:left; display: flex; align-items: center; gap: 10px; border-bottom: none;">
                    <img src="${teamLogo}" 
                         style="width: 24px; height: 24px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));" 
                         onerror="this.src='https://via.placeholder.com/24?text=?'">
                    <strong>${team.takim_adi}</strong>
                </td>
                <td>${team.om}</td>
                <td>${team.g}</td>
                <td>${team.b}</td>
                <td>${team.m}</td>
                <td style="color: #00ff00; font-weight: bold;">${team.puan}</td>
            </tr>`;
    });
}
// 5. Sezon Değişince
function changeSeason() {
    if (currentLeagueId) {
        const season = document.getElementById("seasonSelect").value;
        fetchStandings(currentLeagueId, season);
        fetchFixtures(currentLeagueId,season);
    }
}
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// 1. BAŞLANGIÇ AYARI: Her zaman karanlık başlasın
// LocalStorage'ı kontrol etmiyoruz (her zaman karanlık başlaması için), 
// sadece mevcut durumu set ediyoruz.
document.documentElement.setAttribute('data-theme', 'dark');
themeIcon.innerText = '☀️'; // Karanlıkta güneş (aydınlığa geçmek için)

themeToggle.addEventListener('click', () => {
    // Mevcut temayı al
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Profesyonel Dönme Animasyonu Sınıfı Ekle
    themeToggle.classList.add('rotating');
    
    // Temayı Değiştir
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // İkonu Değiştir (Emoji kullanımı daha akıcıdır)
    // Aydınlık modda 'Ay' (Geceye geçmek için), Karanlık modda 'Güneş'
    setTimeout(() => {
        themeIcon.innerText = (newTheme === 'light') ? '🌙' : '☀️';
    }, 150); // Dönüşün tam ortasında ikon değişsin

    // Animasyon bitince sınıfı kaldır
    setTimeout(() => {
        themeToggle.classList.remove('rotating');
    }, 600);
});


// --- YENİ FİKSTÜR SİSTEMİ DEĞİŞKENLERİ ---
let currentTab = 'standings';
let allFixtures = []; // Tüm sezonun maçlarını hafızada tutacağız (hızlı geçiş için)
let currentWeek = 1;
let matchesPerWeek = 9; // 18 takım varsa haftada 9 maç oynanır

// 1. Sekme Değiştirme Fonksiyonu
function switchTab(tabName) {
    currentTab = tabName;
    
    const standingsView = document.getElementById('standingsView');
    const fixturesView = document.getElementById('fixturesView');
    const btnStandings = document.getElementById('btnStandings');
    const btnFixtures = document.getElementById('btnFixtures');

    if (tabName === 'standings') {
        standingsView.style.display = 'block';
        fixturesView.style.display = 'none';
        btnStandings.style.background = '#00ff00'; btnStandings.style.color = '#000';
        btnFixtures.style.background = '#333'; btnFixtures.style.color = '#fff';
    } else {
        standingsView.style.display = 'none';
        fixturesView.style.display = 'block';
        btnFixtures.style.background = '#00ff00'; btnFixtures.style.color = '#000';
        btnStandings.style.background = '#333'; btnStandings.style.color = '#fff';
        
        // Fikstür sekmesine geçilince veriyi çek
        const season = document.getElementById("seasonSelect").value;
        fetchFixtures(currentLeagueId, season);
    }
}

// 2. Fikstür Verilerini Supabase'den Çek
// 2. Fikstür Verilerini Supabase'den Çek (SEZON DESTEKLİ)
async function fetchFixtures(leagueId, season) {
    const fixtureList = document.getElementById("fixtureList");
    fixtureList.innerHTML = '<div style="text-align:center; padding:20px;">🔄 Maçlar Yükleniyor...</div>';

    // Supabase'den o ligin ve o SEZONUN tüm maçlarını ID'ye göre sıralı çekiyoruz
    let { data, error } = await _supabase
        .from('matches')
        .select('*')
        .eq('league_id', leagueId)
        .eq('season', String(season)) // YENİ: Hangi sezon seçiliyse onu çeker!
        .order('id', { ascending: true });

    if (error) {
        fixtureList.innerHTML = `<div style="text-align:center; color:red;">Hata: ${error.message}</div>`;
        return;
    }

    if (!data || data.length === 0) {
        // Eğer o sezonun verisi yoksa uyarı ver
        fixtureList.innerHTML = `<div style="text-align:center; color:#ffaa00; padding:20px;">⚠️ ${season} sezonu için fikstür verisi henüz çekilmedi.</div>`;
        return;
    }

    // Verileri hafızaya al ve 1. Haftayı göster
    allFixtures = data;
    matchesPerWeek = (allFixtures.length === 306) ? 9 : 10; // 18 takımsa 9 maç, 20 takımsa 10 maç
    currentWeek = 1; 
    renderWeek(currentWeek);
}


// 3. İlgili Haftanın Maçlarını Ekrana Bas (TARİH EKLENTİLİ)
function renderWeek(weekNum) {
    const fixtureList = document.getElementById("fixtureList");
    const weekDisplay = document.getElementById("currentWeekDisplay");
    
    const totalWeeks = Math.ceil(allFixtures.length / matchesPerWeek);
    
    if (weekNum < 1) currentWeek = 1;
    if (weekNum > totalWeeks) currentWeek = totalWeeks;

    weekDisplay.innerText = `${currentWeek}. Hafta`;

    const startIndex = (currentWeek - 1) * matchesPerWeek;
    const endIndex = startIndex + matchesPerWeek;
    const weeklyMatches = allFixtures.slice(startIndex, endIndex);

    fixtureList.innerHTML = ""; 

    weeklyMatches.forEach(mac => {
        let scoreDisplay = mac.status === 'FT' ? `${mac.home_score} - ${mac.away_score}` : '-';
        let colorDisplay = mac.status === 'FT' ? '#00ff00' : '#555';
        
        let macTarihi = mac.match_date_text || "Tarih Belirsiz";
        let macSaati = (mac.match_time && mac.match_time !== "Belirsiz") ? mac.match_time : ""; 
        
        // Logo var mı kontrolü ve profesyonel stil ayarları
        const hLogo = mac.home_team_logo || 'https://via.placeholder.com/30?text=?';
        const aLogo = mac.away_team_logo || 'https://via.placeholder.com/30?text=?';

        let saatBadge = macSaati ? `<span style="background: #2a2a2a; color: #ddd; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.85em; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${macSaati}</span>` : '';

        fixtureList.innerHTML += `
            <div style="display: flex; flex-direction: column; background: #161616; padding: 16px; border-radius: 12px; border: 1px solid #222; transition: transform 0.2s, background 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3); margin-bottom: 12px;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #222;">
                    <span style="color: #777; font-size: 0.8em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">
                        ${macTarihi}
                    </span>
                    ${saatBadge}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div style="flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 12px;">
                        <span style="font-weight: 600; font-size: 1.1em; color: #eee; text-align: right;">${mac.home_team_name}</span>
                        <img src="${hLogo}" alt="logo" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    </div>
                    
                    <div style="margin: 0 10px; padding: 8px 18px; background: #0c0c0c; border-radius: 8px; font-weight: 700; font-size: 1.3em; color: ${colorDisplay}; text-align: center; min-width: 80px; border: 1px solid #1a1a1a; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
                        ${scoreDisplay}
                    </div>
                    
                    <div style="flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 12px;">
                        <img src="${aLogo}" alt="logo" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                        <span style="font-weight: 600; font-size: 1.1em; color: #eee; text-align: left;">${mac.away_team_name}</span>
                    </div>
                </div>
                
            </div>
        `;
    });
}

// 4. İleri/Geri Butonları İçin Fonksiyon
function changeWeek(direction) {
    if (allFixtures.length === 0) return;
    currentWeek += direction;
    renderWeek(currentWeek);
}
function backToLeagues() {
   window.location.reload();
}
