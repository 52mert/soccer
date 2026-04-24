// 1. ELEMANLARI SEÇELİM
// 1. DEĞİŞKENLERİ TANIMLAMA
const matchesDiv = document.getElementById("matches"); 
const statsPage = document.getElementById("statsPage");
const navItems = document.querySelectorAll(".nav-item");
const themeBtn = document.getElementById("themeToggle");
const searchInput = document.getElementById("takim-ara");
const sonuclarDiv = document.getElementById("sonuclar");

let tumMaclar = []; 
let gonderilcekMaclar= [];

// 2. TIKLAMA OLAYLARI (Üst Menü)
navItems.forEach(item => {
    item.addEventListener("click", e => {
        e.preventDefault();
        
        if (item.dataset.type === "league") {
            window.location.href = 'ligler.htm';
        } else {
            getMatches(item.dataset.type);
        }
    });
});

// 3. VERİ ÇEKME VE FİLTRELEME (GET MATCHES)
async function getMatches(type) {
    const API_KEY = "148629adfebedb4763c60d328dbccd88";
    
    // Güvenlik kontrolü: HTML elemanları DOM'da var mı?
    if (!matchesDiv || !statsPage) {
        console.error("Hata: 'matches' veya 'statsPage' ID'li elemanlar DOM'da bulunamadı.");
        return;
    }

    // Sayfa geçişini ayarla
    matchesDiv.style.display = "block";
    statsPage.style.display = "none";

    try {
        matchesDiv.innerHTML = "<div class='loading'>Maçlar yükleniyor...</div>";

        // API-Football URL'sini belirliyoruz
        let url = "https://v3.football.api-sports.io/fixtures?date=" + new Date().toISOString().split('T')[0];
        if (type === "live") {
            url = "https://v3.football.api-sports.io/fixtures?live=all";
        }

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-rapidapi-key": API_KEY,
                "x-rapidapi-host": "v3.football.api-sports.io"
            }
        });

        if (!res.ok) throw new Error("API bağlantısı kurulamadı!");

        const json = await res.json();
        
        // API-Football veriyi json.response içinde döndürür
        if (json.response && json.response.length > 0) {
            showMatches(json.response);
        } else {
            matchesDiv.innerHTML = "<div class='no-match'>Görüntülenecek maç bulunamadı.</div>";
        }

    } catch (err) {
        console.error("Veri çekme hatası:", err);
        matchesDiv.innerHTML = `<div class='error'>Hata: ${err.message}</div>`;
    }
}
// 4. EKRANA BASMA (SHOW MATCHES)
function showMatches(matches) {
    // HTML'deki ID 'matches' olduğu için onu doğru şekilde yakalıyoruz
    const container = document.getElementById("matches");
    
    if (!container) {
        console.error("Hata: 'matches' ID'li div bulunamadı! HTML dosyanı kontrol et.");
        return;
    }

    // Arama özelliği için gelen veriyi global değişkene yedekliyoruz
    tumMaclar = matches;

    container.innerHTML = ""; // İçeriyi temizle

    matches.forEach(match => {
        // API-Football Yapısı
        const homeTeam = match.teams.home.name;
        const awayTeam = match.teams.away.name;
        const homeLogo = match.teams.home.logo;
        const awayLogo = match.teams.away.logo;

        // Skorlar
        const homeScore = match.goals.home ?? 0;
        const awayScore = match.goals.away ?? 0;

        const statusShort = match.fixture.status.short;
        const elapsed = match.fixture.status.elapsed;
        
        let zamanClass2 = "";
        let zamanBilgisi = "";

        // Zaman Durumu Hesaplama
        if (["FT", "AET", "PEN"].includes(statusShort)) {
            zamanBilgisi = "MS";
            zamanClass2 = "finished";
        } else if (["1H", "2H", "HT", "ET", "P"].includes(statusShort)) {
            zamanBilgisi = (statusShort === "HT") ? "DA" : `${elapsed}'`; 
            zamanClass2 = "live-now";
        } else {
            const matchDate = new Date(match.fixture.date);
            zamanBilgisi = matchDate.getHours().toString().padStart(2, '0') + ":" + 
                           matchDate.getMinutes().toString().padStart(2, '0');
            zamanClass2 = "upcoming";
        }

        const card = document.createElement("div");
        card.classList.add("match-card");
        card.style.cursor = "pointer";

        card.innerHTML = `
            <div class="match-teams">
                <div class="team home">
                    <span class="team-name">${homeTeam}</span>
                    <img src="${homeLogo}" class="team-logo">
                </div>
                <div class="score">${homeScore} - ${awayScore}</div>
                <div class="team away">
                    <img src="${awayLogo}" class="team-logo">
                    <span class="team-name">${awayTeam}</span>
                </div>
            </div>
            <div class="match-time ${zamanClass2}">${zamanBilgisi}</div>
        `;

        // Tıklanınca detay sayfasına git
        card.addEventListener("click", () => {
            localStatistics(match.fixture.id);
        });

        container.appendChild(card);
    });
}
// İstatistikler liste isteğinde gelmediği için, tıklandığında maça özel fetch atıyoruz
async function localStatistics(matchId) {
    const API_KEY = "148629adfebedb4763c60d328dbccd88";
    
    // HTML'deki doğru ID 'matches' olduğu için onu yakalıyoruz
    const matchesContainer = document.getElementById("matches");
    const statsPage = document.getElementById("statsPage");
    const header = document.getElementById("selectedMatchHeader");
    const statsList = document.getElementById("statsList");
    const eventsList = document.getElementById("eventsList");

    // Güvenlik kontrolü
    if (!matchesContainer || !statsPage) {
        console.error("Hata: Gerekli HTML elemanları (matches veya statsPage) bulunamadı!");
        return;
    }

    // Sayfa geçişini yap
    matchesContainer.style.display = "none";
    statsPage.style.display = "block";

    // Yükleniyor mesajı
    header.innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>Maç detayları yükleniyor...</div>";
    statsList.innerHTML = "";
    eventsList.innerHTML = "";

    try {
        const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${matchId}`, {
            method: "GET",
            headers: {
                "x-rapidapi-key": API_KEY,
                "x-rapidapi-host": "v3.football.api-sports.io"
            }
        });
        
        const json = await res.json();
        const match = json.response[0];

        if (!match) {
            header.innerHTML = "<div style='text-align:center; color:red;'>Maç detayı bulunamadı.</div>";
            return;
        }

        const homeTeamObj = match.teams.home; 
        const awayTeamObj = match.teams.away;
        const homeScore = match.goals.home ?? 0;
        const awayScore = match.goals.away ?? 0;
        const statusShort = match.fixture.status.short;
        const elapsed = match.fixture.status.elapsed;

        let zamanBilgisi = "Başlamadı";
        let zamanClassDetay = "";

        if (["FT", "AET", "PEN"].includes(statusShort)) {
            zamanBilgisi = "MS";
        } else if (["1H", "2H", "HT", "ET", "P"].includes(statusShort)) {
            const displayMin = statusShort === "HT" ? "DA" : `${elapsed}'`;
            zamanBilgisi = `<span style="color:#27ae60;">${displayMin} Canlı</span>`;
            zamanClassDetay = "live-now";
        } else {
            const matchDate = new Date(match.fixture.date);
            zamanBilgisi = matchDate.getHours().toString().padStart(2, '0') + ":" + matchDate.getMinutes().toString().padStart(2, '0');
        }

        // --- HEADER ---
        header.innerHTML = `
            <div class="${zamanClassDetay}" style="text-align: center; font-weight: bold; margin-bottom: 15px;">
                ${zamanBilgisi}
            </div>
            <div class="header-teams" style="display:flex; justify-content:space-around; align-items:center;">
                <div class="header-team" style="text-align:center;">
                    <img src="${homeTeamObj.logo}" width="60" style="border-radius:50%;">
                    <p style="margin-top:10px; font-weight:bold;">${homeTeamObj.name}</p>
                </div>
                <div class="header-score-container">
                    <div class="header-score" style="font-size: 36px; font-weight: bold; background: #f8f9fa; padding: 10px 30px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        ${homeScore} - ${awayScore}
                    </div>
                </div>
                <div class="header-team" style="text-align:center;">
                    <img src="${awayTeamObj.logo}" width="60" style="border-radius:50%;">
                    <p style="margin-top:10px; font-weight:bold;">${awayTeamObj.name}</p>
                </div>
            </div>`;

        // --- İSTATİSTİKLER ---
        statsList.innerHTML = "<h3 style='border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px;'>Maç İstatistikleri</h3>";
        
        const statTranslations = {
            "Shots on Goal": "İsabetli Şut", "Shots off Goal": "İsabetsiz Şut", "Total Shots": "Toplam Şut",
            "Blocked Shots": "Engellenen Şut", "Fouls": "Faul", "Corner Kicks": "Korner", "Offsides": "Ofsayt", 
            "Ball Possession": "Topla Oynama (%)", "Yellow Cards": "Sarı Kart", "Red Cards": "Kırmızı Kart", 
            "Goalkeeper Saves": "Kaleci Kurtarışı", "Total passes": "Toplam Pas", "Passes accurate": "İsabetli Pas", "Passes %": "Pas Başarısı (%)"
        };

        if (match.statistics && match.statistics.length === 2) {
            const homeStats = match.statistics[0].statistics;
            const awayStats = match.statistics[1].statistics;

            homeStats.forEach(stat => {
                const hValRaw = stat.value;
                const aValRaw = awayStats.find(s => s.type === stat.type)?.value;

                let hVal = hValRaw === null ? 0 : String(hValRaw).replace('%', '');
                let aVal = aValRaw === null ? 0 : String(aValRaw).replace('%', '');

                hVal = parseInt(hVal) || 0;
                aVal = parseInt(aVal) || 0;

                if (hVal === 0 && aVal === 0) return;

                const label = statTranslations[stat.type] || stat.type;
                let total = hVal + aVal;
                let hPerc = total === 0 ? 50 : (hVal / total) * 100;
                let aPerc = total === 0 ? 50 : (aVal / total) * 100;

                if (stat.type === "Ball Possession" || stat.type === "Passes %") { hPerc = hVal; aPerc = aVal; }

                statsList.innerHTML += `
                    <div style="margin-bottom: 20px;">
                        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:bold; margin-bottom:5px;">
                            <span>${hValRaw !== null ? hValRaw : 0}</span>
                            <span style="color:#7f8c8d; font-weight:normal; text-align:center; font-size:13px;">${label}</span>
                            <span>${aValRaw !== null ? aValRaw : 0}</span>
                        </div>
                        <div style="display:flex; height:8px; background:#e0e0e0; border-radius:4px; overflow:hidden;">
                            <div style="width:${hPerc}%; background:#1a252f;"></div>
                            <div style="width:${aPerc}%; background:#c0392b;"></div>
                        </div>
                    </div>`;
            });
        } else {
            statsList.innerHTML += "<div class='no-data' style='color:#7f8c8d; text-align:center;'>İstatistik verisi bulunamadı.</div>";
        }

        // --- OLAYLAR ---
        eventsList.innerHTML = "<h3 style='border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; margin-top:30px;'>Maç Olayları</h3>";
        
        if (match.events && match.events.length > 0) {
            const tumOlaylar = [...match.events].sort((a, b) => a.time.elapsed - b.time.elapsed);

            tumOlaylar.forEach(event => {
                const isHome = event.team.id === homeTeamObj.id;
                const flexDir = isHome ? "row" : "row-reverse";
                const textAlign = isHome ? "left" : "right";

                let icon = "📌"; 
                let detail = ""; 
                
                if (event.type === "Goal") {
                    icon = "⚽";
                    if (event.assist.name) detail = `(Asist: ${event.assist.name})`;
                    if (event.detail === "Own Goal") detail = "(Kendi Kalesine)";
                } else if (event.type === "subst") {
                    icon = "🔄";
                    if (event.assist.name) detail = `(Çıkan: ${event.assist.name})`;
                } else if (event.type === "Card") {
                    icon = event.detail.includes("Red") ? "🟥" : "🟨"; 
                }

                const displayMinute = event.time.extra ? `${event.time.elapsed}+${event.time.extra}` : event.time.elapsed;

                eventsList.innerHTML += `
                    <div style="display:flex; align-items:center; flex-direction:${flexDir}; margin-bottom: 12px; border-bottom: 1px solid #f9f9f9; padding-bottom: 8px;">
                        <div style="font-weight:bold; color:#27ae60; margin: 0 15px; font-size:14px; min-width:30px; text-align:center;">${displayMinute}'</div>
                        <div style="margin: 0 10px; font-size: 18px;">${icon}</div>
                        <div style="text-align:${textAlign}; flex-grow: 1;">
                            <span style="font-weight:bold;">${event.player.name || 'Bilinmiyor'}</span>
                            <div style="font-size:12px; color:#95a5a6;">${detail}</div>
                        </div>
                    </div>`;
            });
        } else {
            eventsList.innerHTML += "<div class='no-data' style='color:#7f8c8d; text-align:center;'>Henüz maç olayı yok.</div>";
        }

    } catch (error) {
        console.error("Hata:", error);
        header.innerHTML = "<div style='color:red; text-align:center;'>Bağlantı hatası oluştu.</div>";
    }

    // Geri Dönme Fonksiyonu
    document.getElementById("btnGeri").onclick = function() {
        statsPage.style.display = "none";
        matchesContainer.style.display = "block";
    };
}
// 6. YARDIMCI FONKSİYONLAR


// Arama fonksiyonu (Global listeyi filtreler)
function filtrele() {
    const searchInput = document.getElementById("takim-ara");
    const arananKelime = searchInput.value.toLowerCase().trim();
    
    // Eğer kutu boşsa tüm ana listeyi geri getir
    if (arananKelime.length === 0) {
        showMatches(tumMaclar);
        return;
    }

    // Arama sadece 2 harften fazlaysa başlasın (performans için)
    if (arananKelime.length < 2) return;

    const bulunanlar = tumMaclar.filter(match => {
        // API-Football'da takım isimleri bu yollarda bulunur:
        const homeName = match.teams.home.name.toLowerCase();
        const awayName = match.teams.away.name.toLowerCase();
        const leagueName = match.league.name.toLowerCase(); // Ekstra: Lig adına göre de aratabilirsin

        // Aranan kelime ev sahibi, deplasman veya lig adında geçiyor mu?
        return homeName.includes(arananKelime) || 
               awayName.includes(arananKelime) || 
               leagueName.includes(arananKelime);
    });

    showMatches(bulunanlar);
}

// Input alanına her yazı yazıldığında çalışması için listener
const searchInputEl = document.getElementById("takim-ara");
if (searchInputEl) {
    searchInputEl.addEventListener("input", filtrele);
}
// 7. TEMA VE DİNLEYİCİLER
themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeBtn.textContent = isDark ? "🔆" : "🌙";
});



if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    themeBtn.textContent = "🔆";
}

// Başlangıçta verileri çek
getMatches("today");