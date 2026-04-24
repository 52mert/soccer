// 1. SUPABASE BAĞLANTI BİLGİLERİ (GÜVENLİ)
const SUPABASE_URL = "https://xozwjuudbypmqewncdoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XeQN6Ha9dWfJ_SqjLUsx9A_DM-8ld4k"; 

// 2. ELEMANLARI SEÇELİM
const matchesDiv = document.getElementById("matches"); 
const statsPage = document.getElementById("statsPage");
const navItems = document.querySelectorAll(".nav-item");
const themeBtn = document.getElementById("themeToggle");
const searchInput = document.getElementById("takim-ara");
const sonuclarDiv = document.getElementById("sonuclar");

let tumMaclar = []; 

// 3. TIKLAMA OLAYLARI (Üst Menü)
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

// 4. SUPABASE'DEN VERİ ÇEKME VE FİLTRELEME (GET MATCHES)
async function getMatches(type) {
    if (!matchesDiv || !statsPage) {
        console.error("Hata: Gerekli HTML elemanları DOM'da bulunamadı.");
        return;
    }

    matchesDiv.style.display = "block";
    statsPage.style.display = "none";

    try {
        matchesDiv.innerHTML = "<div class='loading'>Aga-Scorer Verileri Yükleniyor...</div>";

        // İki tablodan aynı anda veri çekiyoruz (daily_matches ve selected_matches)
        const headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
        };

        const [resDaily, resSelected] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/daily_matches?select=*`, { method: "GET", headers }),
            fetch(`${SUPABASE_URL}/rest/v1/selected_matches?select=match_id`, { method: "GET", headers })
        ]);

        if (!resDaily.ok) throw new Error("Veritabanına bağlanılamadı!");

        const data = await resDaily.json();
        const selectedData = await resSelected.json();
        
        // Hangi maçların "Seçilmiş Maç" olduğunu bir listeye alıyoruz
        const selectedIds = selectedData.map(s => s.match_id);
        
        if (data && data.length > 0) {
            let filtrelenmisMaclar = data;
            
            const bugun = new Date().toISOString().split('T')[0];

            if (type === "live") {
                const canliDurumlar = ["1H", "2H", "HT", "ET", "P", "LIVE"];
                filtrelenmisMaclar = data.filter(match => canliDurumlar.includes(match.status_short));
                
                // MÜKEMMEL ALGORİTMA: Seçilmiş maçları en üste al (1 değeri alır, diğerleri 0 alır, büyükten küçüğe sıralar)
                filtrelenmisMaclar.sort((a, b) => {
                    const aIsSelected = selectedIds.includes(a.match_id) ? 1 : 0;
                    const bIsSelected = selectedIds.includes(b.match_id) ? 1 : 0;
                    return bIsSelected - aIsSelected; 
                });

            } else if (type === "today" || !type) {
                filtrelenmisMaclar = data.filter(match => match.match_date && match.match_date.startsWith(bugun));
            }

            if (filtrelenmisMaclar.length > 0) {
                showMatches(filtrelenmisMaclar);
            } else {
                if (type === "live") {
                    matchesDiv.innerHTML = "<div class='no-match' style='text-align:center; padding:20px;'>Şu an oynanan canlı maç bulunmuyor.</div>";
                } else {
                    matchesDiv.innerHTML = "<div class='no-match' style='text-align:center; padding:20px;'>Bugün için planlanan maç bulunamadı.</div>";
                }
            }
        } else {
            matchesDiv.innerHTML = "<div class='no-match' style='text-align:center; padding:20px;'>Veritabanında henüz maç yok.</div>";
        }

    } catch (err) {
        console.error("Veri çekme hatası:", err);
        matchesDiv.innerHTML = `<div class='error' style='text-align:center; color:red;'>Hata: ${err.message}</div>`;
    }
}

// 5. EKRANA BASMA (SHOW MATCHES)
function showMatches(matches) {
    const container = document.getElementById("matches");
    if (!container) return;

    tumMaclar = matches;
    container.innerHTML = ""; 

    matches.forEach(match => {
        const homeTeam = match.home_name;
        const awayTeam = match.away_name;
        const homeLogo = match.home_logo;
        const awayLogo = match.away_logo;
        const homeScore = match.home_score ?? 0;
        const awayScore = match.away_score ?? 0;
        const statusShort = match.status_short;
        const elapsed = match.elapsed ?? 0;
        
        let zamanClass2 = "";
        let zamanBilgisi = "";

        if (["FT", "AET", "PEN"].includes(statusShort)) {
            zamanBilgisi = "MS";
            zamanClass2 = "finished";
        } else if (["1H", "2H", "HT", "ET", "P", "LIVE"].includes(statusShort)) {
            zamanBilgisi = (statusShort === "HT") ? "DA" : `${elapsed}'`; 
            zamanClass2 = "live-now";
        } else {
            const matchDate = new Date(match.match_date);
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

        card.addEventListener("click", () => {
            localStatistics(match.match_id); 
        });

        container.appendChild(card);
    });
}

// 6. MAÇ DETAYLARI (ÇİFT TABLO BİRLEŞİMİ)
async function localStatistics(matchId) {
    const matchesContainer = document.getElementById("matches");
    const statsPage = document.getElementById("statsPage");
    const header = document.getElementById("selectedMatchHeader");
    const statsList = document.getElementById("statsList");
    const eventsList = document.getElementById("eventsList");

    matchesContainer.style.display = "none";
    statsPage.style.display = "block";

    header.innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>Maç detayları yükleniyor...</div>";
    statsList.innerHTML = "";
    eventsList.innerHTML = "";

    try {
        const headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        };

        // Hem skor/takım bilgilerini hem de istatistik/olayları aynı anda çekiyoruz
        const [resMatch, resDetails] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/daily_matches?match_id=eq.${matchId}&select=*`, { method: "GET", headers }),
            fetch(`${SUPABASE_URL}/rest/v1/selected_matches?match_id=eq.${matchId}&select=*`, { method: "GET", headers })
        ]);
        
        const dataMatch = await resMatch.json();
        const dataDetails = await resDetails.json();
        
        const match = dataMatch[0]; 
        const details = dataDetails[0] || {}; // Eğer o maç selected_matches tablosunda yoksa boş obje oluştur

        if (!match) {
            header.innerHTML = "<div style='text-align:center; color:red;'>Maç detayı bulunamadı.</div>";
            return;
        }

        const homeScore = match.home_score ?? 0;
        const awayScore = match.away_score ?? 0;
        const statusShort = match.status_short;
        const elapsed = match.elapsed ?? 0;

        let zamanBilgisi = "Başlamadı";
        let zamanClassDetay = "";

        if (["FT", "AET", "PEN"].includes(statusShort)) {
            zamanBilgisi = "MS";
        } else if (["1H", "2H", "HT", "ET", "P", "LIVE"].includes(statusShort)) {
            zamanBilgisi = `<span style="color:#27ae60;">${statusShort === "HT" ? "DA" : elapsed + "'"}</span>`;
            zamanClassDetay = "live-now";
        } else {
            const matchDate = new Date(match.match_date);
            zamanBilgisi = matchDate.getHours().toString().padStart(2, '0') + ":" + matchDate.getMinutes().toString().padStart(2, '0');
        }

        header.innerHTML = `
            <div class="${zamanClassDetay}" style="text-align: center; font-weight: bold; margin-bottom: 15px;">
                ${zamanBilgisi}
            </div>
            <div class="header-teams" style="display:flex; justify-content:space-around; align-items:center;">
                <div class="header-team" style="text-align:center;">
                    <img src="${match.home_logo}" width="60" style="border-radius:50%;">
                    <p style="margin-top:10px; font-weight:bold;">${match.home_name}</p>
                </div>
                <div class="header-score-container">
                    <div class="header-score" style="font-size: 36px; font-weight: bold; background: #f8f9fa; padding: 10px 30px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                        ${homeScore} - ${awayScore}
                    </div>
                </div>
                <div class="header-team" style="text-align:center;">
                    <img src="${match.away_logo}" width="60" style="border-radius:50%;">
                    <p style="margin-top:10px; font-weight:bold;">${match.away_name}</p>
                </div>
            </div>`;

        // İSTATİSTİKLER (Artık details.stats üzerinden alınıyor)
        statsList.innerHTML = "<h3 style='border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px;'>Maç İstatistikleri</h3>";
        
        const statTranslations = {
            "Shots on Goal": "İsabetli Şut", "Shots off Goal": "İsabetsiz Şut", "Total Shots": "Toplam Şut",
            "Blocked Shots": "Engellenen Şut", "Fouls": "Faul", "Corner Kicks": "Korner", "Offsides": "Ofsayt", 
            "Ball Possession": "Topla Oynama (%)", "Yellow Cards": "Sarı Kart", "Red Cards": "Kırmızı Kart", 
            "Goalkeeper Saves": "Kaleci Kurtarışı", "Total passes": "Toplam Pas", "Passes accurate": "İsabetli Pas", "Passes %": "Pas Başarısı (%)"
        };

        if (details.stats && details.stats.length === 2) {
            const homeStats = details.stats[0].statistics;
            const awayStats = details.stats[1].statistics;

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
            statsList.innerHTML += "<div class='no-data' style='color:#7f8c8d; text-align:center;'>Bu maç için istatistik bulunmuyor.</div>";
        }

        // OLAYLAR (Artık details.events üzerinden alınıyor)
        eventsList.innerHTML = "<h3 style='border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px; margin-top:30px;'>Maç Olayları</h3>";
        
        if (details.events && details.events.length > 0) {
            const tumOlaylar = [...details.events].sort((a, b) => a.time.elapsed - b.time.elapsed);

            tumOlaylar.forEach(event => {
                const isHome = event.team.name === match.home_name;
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

    document.getElementById("btnGeri").onclick = function() {
        statsPage.style.display = "none";
        matchesContainer.style.display = "block";
    };
}

// 7. ARAMA FONKSİYONU
function filtrele() {
    const searchInput = document.getElementById("takim-ara");
    const arananKelime = searchInput.value.toLowerCase().trim();
    
    if (arananKelime.length === 0) {
        showMatches(tumMaclar);
        return;
    }

    if (arananKelime.length < 2) return;

    const bulunanlar = tumMaclar.filter(match => {
        const homeName = (match.home_name || "").toLowerCase();
        const awayName = (match.away_name || "").toLowerCase();

        return homeName.includes(arananKelime) || awayName.includes(arananKelime);
    });

    showMatches(bulunanlar);
}

const searchInputEl = document.getElementById("takim-ara");
if (searchInputEl) {
    searchInputEl.addEventListener("input", filtrele);
}

// 8. TEMA VE BAŞLANGIÇ
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

// Sistemi Başlat
getMatches("today");
