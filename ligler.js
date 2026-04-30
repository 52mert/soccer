
const SUPABASE_URL = 'https://xozwjuudbypmqewncdoo.supabase.co';

const SUPABASE_KEY = 'sb_publishable_XeQN6Ha9dWfJ_SqjLUsx9A_DM-8ld4k'; 
//supabase kutuphanesinden creatClient kullaniyoruz cunku uzunfetch istekleri atmamiza gerek yok
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

    const season = document.getElementById("seasonSelect").value;
    fetchStandings(leagueId, season);
}


// 3. Veri Çekme Motoru (CANLI DESTEKLİ)
async function fetchStandings(leagueId, season) {
    const tbody = document.getElementById("standingBody");
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">🔄 Puan Durumu Hesaplanıyor...</td></tr>';

    let finalData = [];

    console.log(`${leagueId} ligi ${season} sezonu hesaplanıyor...`);
    
    // SİHİR 1: Artık sadece FT değil, canlı oynanan maçları da dahil ediyoruz!
    const validStatuses = ['FT', '1H', '2H', 'HT', 'LIVE', 'ET', 'P', 'BT'];

    const { data: matches, error: matchError } = await _supabase
        .from('matches')
        .select('*')
        .eq('league_id', leagueId)
        .eq('season', String(season))
        .in('status', validStatuses); // Canlı maçlar da matematiğe dahil oldu

    if (!matchError && matches && matches.length > 0) {
        let hesaplananTablo = {};
        console.log("selam");
        // YENİ: Sadece isimleri değil, o anki skoru da tutacak olan SÖZLÜK
        let canliSkorlar = {}; 

        matches.forEach(mac => {
            // SİHİR 2: Eğer maçın dakikası varsa (elapsed null değilse), takım canlı oynuyordur!
            if (mac.elapsed !== null) {
                // Skoru "Ev - Dep" formatında kaydediyoruz
                let anlikSkor = `${mac.home_score} - ${mac.away_score}`;
                canliSkorlar[mac.home_team_name] = anlikSkor;
                canliSkorlar[mac.away_team_name] = anlikSkor;
            }

            if (!hesaplananTablo[mac.home_team_name]) {
                hesaplananTablo[mac.home_team_name] = { 
                    takim_adi: mac.home_team_name, 
                    logo: mac.home_team_logo,
                    om: 0, g: 0, b: 0, m: 0, puan: 0, averaj: 0 
                };
            }
            if (!hesaplananTablo[mac.away_team_name]) {
                hesaplananTablo[mac.away_team_name] = { 
                    takim_adi: mac.away_team_name, 
                    logo: mac.away_team_logo,
                    om: 0, g: 0, b: 0, m: 0, puan: 0, averaj: 0 
                };
            }

            // Oynanan Maç Sayısı (Canlı maçları da oynanmış kabul ediyoruz anlık puan için)
            hesaplananTablo[mac.home_team_name].om++;
            hesaplananTablo[mac.away_team_name].om++;
            
            // Averaj Hesaplama
            hesaplananTablo[mac.home_team_name].averaj += (mac.home_score - mac.away_score);
            hesaplananTablo[mac.away_team_name].averaj += (mac.away_score - mac.home_score);

            // Galibiyet, Beraberlik, Mağlubiyet ve Puanlar
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

        // Puan ve Averaja göre sıralama
        finalData = Object.values(hesaplananTablo).sort((a, b) => {
            if (b.puan === a.puan) return b.averaj - a.averaj;
            return b.puan - a.puan;
        });

        // --- EKRANA BASTIRMA ---
        tbody.innerHTML = "";
        finalData.forEach((team, index) => {
            const teamLogo = team.logo || 'https://via.placeholder.com/24?text=?';
            
            // YENİ: Takımın o an oynadığı bir maç var mı diye sözlüğe bakıyoruz
            const canliSkor = canliSkorlar[team.takim_adi];
            
            // YENİ: Eğer canlı maç varsa nokta yerine yanıp sönen şık bir skor rozeti koy!
            const liveIndicator = canliSkor 
                ? `<span style="color: #ff3b30; font-weight: 900; font-size: 0.85em; background: rgba(255, 59, 48, 0.15); padding: 3px 7px; border-radius: 5px; border: 1px solid rgba(255, 59, 48, 0.3); animation: blinker 1.5s linear infinite; margin-right: 8px; box-shadow: 0 0 8px rgba(255, 59, 48, 0.2);">${canliSkor}</span>` 
                : ``;

            // Satırın arkaplanını hafif kızartma kodu
            const satirStili = canliSkor ? 'background-color: rgba(255, 59, 48, 0.08);' : '';

            tbody.innerHTML += `
                <tr style="${satirStili}"> 
                    <td>${index + 1}</td>
                    <td style="text-align:left; display: flex; align-items: center; gap: 10px; border-bottom: none;">
                        ${liveIndicator}
                        <img src="${teamLogo}" 
                             style="width: 24px; height: 24px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));" 
                             onerror="this.src='https://via.placeholder.com/24?text=?'">
                        <strong style="${canliSkor ? 'color: #fff;' : ''}">${team.takim_adi}</strong>
                    </td>
                    <td>${team.om}</td>
                    <td>${team.g}</td>
                    <td>${team.b}</td>
                    <td>${team.m}</td>
                    <td style="color: #00ff00; font-weight: bold;">${team.puan}</td>
                    <td>${team.averaj}</td>
                </tr>`;
        });
    } 
    // Fallback kısmı aynen kalıyor
    else {
        let { data, error } = await _supabase
            .from('lig_siralamasi')
            .select('*')
            .eq('lig_id', String(leagueId)) 
            .eq('sezon', String(season))
            .order('puan', { ascending: false });


        
        if (!error && data && data.length > 0) {
            data.sort((a,b)=>{
                if(a.puan===b.puan){ let averaj1=a.ag-a.yg;
                                    let averaj2=b.ag-b.yg;
                                    return averaj2-averaj1;//buyukten kucuge siralamasi icin 2.yi yazariz
                }
                return b.puan-a.puan;//sort robotuna guven olmaz 
            });
            tbody.innerHTML = "";
            data.forEach((team, index) => {
                const teamLogo = team.takim_logo || 'https://via.placeholder.com/24?text=?';
                tbody.innerHTML += `
                    <tr>
                        <td>${index + 1}</td>
                        <td style="text-align:left; display: flex; align-items: center; gap: 10px; border-bottom: none;">
                            <img src="${teamLogo}" style="width: 24px; height: 24px; object-fit: contain;">
                            <strong>${team.takim_adi}</strong>
                        </td>
                        <td>${team.om}</td>
                        <td>${team.g}</td>
                        <td>${team.b}</td>
                        <td>${team.m}</td>
                        <td style="color: #00ff00; font-weight: bold;">${team.puan}</td>
                    </tr>`;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center">⚠️ ${season} sezonu verisi bulunamadı.</td></tr>`;
        }
    }
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

    setTimeout(() => {

        themeIcon.innerText = (newTheme === 'light') ? '🌙' : '☀️';

    }, 150); // Dönüşün tam ortasında ikon değişsin


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

function renderWeek(weekNum) {
    const fixtureList = document.getElementById("fixtureList");
    const haftaSecici = document.getElementById("haftaSecici"); 
    const btnGuncelHafta = document.getElementById("btnGuncelHafta"); // Butonu yakalıyoruz
    
    // --- GÜNCEL HAFTA BUTONU GÖZÜKME/GİZLENME MANTIĞI ---
    if (btnGuncelHafta) {
        // "secilenSezon" değişkenini kendi kodundaki sezon değişkeniyle değiştir
        // Eğer formatın "2025-2026" şeklindeyse şartı secilenSezon === "2025-2026" yapabilirsin
        if (secilenSezon == "2025" || secilenSezon == 2025) { 
            btnGuncelHafta.style.display = "inline-block"; // 2025 ise göster
        } else {
            btnGuncelHafta.style.display = "none"; // Eski sezonlarda gizle
        }
    }
    
    const totalWeeks = Math.ceil(allFixtures.length / matchesPerWeek);
    
    if (weekNum < 1) currentWeek = 1;
    if (weekNum > totalWeeks) currentWeek = totalWeeks;

    if (haftaSecici) {
        haftaSecici.value = currentWeek; 
    }

    const startIndex = (currentWeek - 1) * matchesPerWeek;
    const endIndex = startIndex + matchesPerWeek;
    const weeklyMatches = allFixtures.slice(startIndex, endIndex);

    fixtureList.innerHTML = ""; 

    weeklyMatches.forEach(mac => {
        // --- CANLI SKOR VE DAKİKA MANTIĞI ---
        const isLive = mac.elapsed !== null; 
        const isFinished = ['FT', 'AET', 'PEN'].includes(mac.status); 

        let scoreDisplay = '-';
        let saatBadge = '';
        let colorDisplay = '#555';

        let macTarihi = mac.match_date_text || "Tarih Belirsiz";
        let macSaati = (mac.match_time && mac.match_time !== "Belirsiz") ? mac.match_time : ""; 

        if (isFinished) {
            scoreDisplay = `${mac.home_score} - ${mac.away_score}`;
            colorDisplay = '#00ff00';
            saatBadge = `<span style="background: #2a2a2a; color: #aaa; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: bold;">MS</span>`;
        } else if (isLive) {
            scoreDisplay = `${mac.home_score} - ${mac.away_score}`;
            colorDisplay = '#ff3b30';
            saatBadge = `<span style="color: #ff3b30; padding: 4px 10px; font-weight: 900; font-size: 0.9em; animation: blinker 1.5s linear infinite;">${mac.elapsed}' <span style="font-size: 0.7em;">🔴</span></span>`;
        } else {
            saatBadge = macSaati ? `<span style="background: #2a2a2a; color: #ddd; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.85em;">${macSaati}</span>` : '';
        }
        
        const hLogo = mac.home_team_logo || 'https://via.placeholder.com/30?text=?';
        const aLogo = mac.away_team_logo || 'https://via.placeholder.com/30?text=?';

        fixtureList.innerHTML += `
         <div onclick="showMatchDetails('${mac.id}')" style="display: flex; flex-direction: column; background: #161616; padding: 16px; border-radius: 12px; border: 1px solid #222; margin-bottom: 12px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='#00ff00'" onmouseout="this.style.borderColor='#222'">    
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #222;">
                    <span style="color: #777; font-size: 0.8em; font-weight: 700; text-transform: uppercase;">
                        ${macTarihi}
                    </span>
                    ${saatBadge}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div style="flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 12px;">
                        <span style="font-weight: 600; font-size: 1.1em; color: #eee; text-align: right;">${mac.home_team_name}</span>
                        <img src="${hLogo}" style="width: 32px; height: 32px; object-fit: contain;">
                    </div>
                    
                    <div style="margin: 0 10px; padding: 8px 18px; background: #0c0c0c; border-radius: 8px; font-weight: 700; font-size: 1.3em; color: ${colorDisplay}; text-align: center; min-width: 80px; border: 1px solid #1a1a1a;">
                        ${scoreDisplay}
                    </div>
                    
                    <div style="flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 12px;">
                        <img src="${aLogo}" style="width: 32px; height: 32px; object-fit: contain;">
                        <span style="font-weight: 600; font-size: 1.1em; color: #eee; text-align: left;">${mac.away_team_name}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Ufak bir uyarı: initHaftaSecici()'yi burada çağırmak çalışır ama
    // butonlara her tıkladığında select menüsünü baştan yaratır.
    // İdeal olanı bunu verileri API'den çektiğin zaman (fetch sonrası) 1 kere çağırmandır!
    initHaftaSecici();
}
function initHaftaSecici() {
    const haftaSecici = document.getElementById("haftaSecici");
    if (!haftaSecici) return; // HTML'de yoksa hata vermesin diye güvenlik önlemi
    
    // Senin formülünle toplam haftayı buluyoruz
    const totalWeeks = Math.ceil(allFixtures.length / matchesPerWeek);
    
    // Select'in içini baştan temizliyoruz (iki kere çağrılırsa üst üste binmesin diye)
    haftaSecici.innerHTML = "";

    // 1'den toplam haftaya kadar döngüye girip option'ları ekliyoruz
    for (let i = 1; i <= totalWeeks; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.innerText = `${i}. Hafta`;
        haftaSecici.appendChild(option);
    }

    // Menüyü oluşturduktan sonra o anki haftamızı seçili hale getiriyoruz
    haftaSecici.value = currentWeek; 
}

function seciliHaftayiGetir(secilenDeger) {
    // Select'ten gelen değer string olduğu için parseInt ile sayıya çeviriyoruz
    currentWeek = parseInt(secilenDeger); 
    renderWeek(currentWeek); // Ekranı yeni haftaya göre çizdir
}

function guncelHaftayaDon(){
    const a1=32;
    renderWeek(a1);
}

// 4. İleri/Geri Butonları İçin Fonksiyon
function changeWeek(direction) {
    if (allFixtures.length === 0) return;
    currentWeek += direction;
    renderWeek(currentWeek);
}

// LİGLERE GERİ DÖN BUTONU
function backToLeagues() {
   window.location.reload();
} 


// --- MAÇ DETAYLARI (İSTATİSTİK VE OLAYLAR) ---

function showMatchDetails(matchId) {
    console.log("Tıklanan Maç ID:", matchId); // Hata ayıklama için konsola yazdırıyoruz

    // SİHİR 2: İki tarafı da String'e çevirerek tip uyuşmazlığını (Sayı vs Metin) engelliyoruz
    const match = allFixtures.find(m => String(m.id) === String(matchId));
    
    if (!match) {
        console.error("Maç bulunamadı! Hafızadaki veride bu ID yok.");
        return;
    }

    // 2. Görünümleri Değiştir
    document.getElementById('fixturesView').style.display = 'none';
    document.getElementById('standingsView').style.display = 'none';
    document.querySelector('.tab-menu').style.display = 'none'; // Sekmeleri gizle
    document.getElementById('matchDetailView').style.display = 'block';

    const header = document.getElementById("selectedMatchHeader");
    const statsList = document.getElementById("statsList");
    const eventsList = document.getElementById("eventsList");

    // --- BAŞLIK (SKOR VE TAKIMLAR) KISMI ---
    let skorDisplay = match.status === 'NS' ? 'v' : `${match.home_score ?? 0} - ${match.away_score ?? 0}`;
    let dakikaDisplay = match.elapsed ? `<span style="color:#27ae60;">${match.elapsed}'</span>` : 'MS';
    if (match.status === 'NS') dakikaDisplay = match.match_time || 'Başlamadı';

    header.innerHTML = `
        <div style="text-align: center; font-weight: bold; margin-bottom: 15px; color: #aaa;">
            ${dakikaDisplay}
        </div>
        <div style="display:flex; justify-content:space-around; align-items:center;">
            <div style="text-align:center;">
                <img src="${match.home_team_logo}" width="60" style="object-fit: contain;">
                <p style="margin-top:10px; font-weight:bold; color: #fff;">${match.home_team_name}</p>
            </div>
            <div style="font-size: 36px; font-weight: bold; background: #0c0c0c; color: #fff; padding: 10px 30px; border-radius: 10px; border: 1px solid #333;">
                ${skorDisplay}
            </div>
            <div style="text-align:center;">
                <img src="${match.away_team_logo}" width="60" style="object-fit: contain;">
                <p style="margin-top:10px; font-weight:bold; color: #fff;">${match.away_team_name}</p>
            </div>
        </div>`;

  // --- VERİLERİ PARÇALAMA (Akıllı Kontrol) ---
    const matchData = match.events; 
    let istaData = [];
    let olayData = [];

    if (matchData) {
        // Eğer matchData bir liste (Array) ise, bu ESKİ YAPIDIR. Hepsini olayData'ya at.
        if (Array.isArray(matchData)) {
            olayData = matchData;
        } 
        // Eğer matchData bir Obje ise ve içinde olaylar/istatistikler varsa, bu YENİ YAPIDIR.
        else {
            istaData = matchData.istatistikler || [];
            olayData = matchData.olaylar || [];
        }
    }

    // --- İSTATİSTİKLER KISMI ---
    statsList.innerHTML = "<h3 style='border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; color: #fff;'>Maç İstatistikleri</h3>";
    
    const statTranslations = {
        "Shots on Goal": "İsabetli Şut", "Shots off Goal": "İsabetsiz Şut", "Total Shots": "Toplam Şut",
        "Blocked Shots": "Engellenen Şut", "Fouls": "Faul", "Corner Kicks": "Korner", "Offsides": "Ofsayt", 
        "Ball Possession": "Topla Oynama (%)", "Yellow Cards": "Sarı Kart", "Red Cards": "Kırmızı Kart", 
        "Goalkeeper Saves": "Kaleci Kurtarışı", "Total passes": "Toplam Pas", "Passes accurate": "İsabetli Pas", "Passes %": "Pas Başarısı (%)"
    };

    if (istaData.length === 2) {
        const homeStats = istaData[0].statistics;
        const awayStats = istaData[1].statistics;

        homeStats.forEach(stat => {
            const hValRaw = stat.value;
            const aValRaw = awayStats.find(s => s.type === stat.type)?.value;

            let hVal = hValRaw === null ? 0 : parseInt(String(hValRaw).replace('%', '')) || 0;
            let aVal = aValRaw === null ? 0 : parseInt(String(aValRaw).replace('%', '')) || 0;

            if (hVal === 0 && aVal === 0) return; // İkisi de 0 ise gösterme

            const label = statTranslations[stat.type] || stat.type;
            let total = hVal + aVal;
            let hPerc = total === 0 ? 50 : (hVal / total) * 100;
            let aPerc = total === 0 ? 50 : (aVal / total) * 100;

            if (stat.type === "Ball Possession" || stat.type === "Passes %") { hPerc = hVal; aPerc = aVal; }

            statsList.innerHTML += `
                <div style="margin-bottom: 15px;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:bold; margin-bottom:5px; color: #eee;">
                        <span>${hValRaw !== null ? hValRaw : 0}</span>
                        <span style="color:#888; font-weight:normal;">${label}</span>
                        <span>${aValRaw !== null ? aValRaw : 0}</span>
                    </div>
                    <div style="display:flex; height:6px; background:#333; border-radius:4px; overflow:hidden;">
                        <div style="width:${hPerc}%; background:#00ff00;"></div>
                        <div style="width:${aPerc}%; background:#ff3b30;"></div>
                    </div>
                </div>`;
        });
    } else {
        statsList.innerHTML += "<div style='color:#777; text-align:center;'>Bu maç için istatistik bulunmuyor.</div>";
    }

    // --- OLAYLAR KISMI ---
    eventsList.innerHTML = "<h3 style='border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px; color: #fff;'>Maç Olayları</h3>";
    
    if (olayData.length > 0) {
        const tumOlaylar = [...olayData].sort((a, b) => a.time.elapsed - b.time.elapsed);

       tumOlaylar.forEach(event => {
    const isHome = event.team.name === match.home_team_name;
    const flexDir = isHome ? "row" : "row-reverse";
    const textAlign = isHome ? "left" : "right";

    let icon = "📌"; 
    let detail = ""; 
    
    if (event.type === "Goal") {
        // Eğer kaçan penaltıysa:
        if (event.detail === "Missed Penalty") {
            icon = "❌"; // İstersen bunu "⚽❌" yapabilirsin
            detail = "(Kaçan Penaltı)";
        } else {
            // Normal gol, kendi kalesine veya normal penaltıysa:
            icon = "⚽";
            if (event.assist && event.assist.name) detail = `(Asist: ${event.assist.name})`;
            if (event.detail === "Own Goal") detail = "(Kendi Kalesine)";
            if (event.detail === "Penalty") detail = "(Penaltı)";
        }
    } else if (event.type === "subst") {
        icon = "🔄";
        if (event.assist && event.assist.name) detail = `(Çıkan: ${event.assist.name})`;
    } else if (event.type === "Card") {
        icon = event.detail.includes("Red") ? "🟥" : "🟨"; 
    } else if (event.type === "Var") {
        // VAR iptalleri için ekstra kontrol
        icon = "📺";
        if (event.detail.includes("Goal Disallowed")) detail = "(İptal Edilen Gol)";
    }
            const displayMinute = event.time.extra ? `${event.time.elapsed}+${event.time.extra}` : event.time.elapsed;

            eventsList.innerHTML += `
                <div style="display:flex; align-items:center; flex-direction:${flexDir}; margin-bottom: 12px; border-bottom: 1px solid #222; padding-bottom: 8px;">
                    <div style="font-weight:bold; color:#00ff00; margin: 0 15px; font-size:14px; min-width:30px; text-align:center;">${displayMinute}'</div>
                    <div style="margin: 0 10px; font-size: 18px;">${icon}</div>
                    <div style="text-align:${textAlign}; flex-grow: 1;">
                        <span style="font-weight:bold; color:#eee;">${event.player.name || 'Bilinmiyor'}</span>
                        <div style="font-size:12px; color:#888;">${detail}</div>
                    </div>
                </div>`;
        });
    } else {
        eventsList.innerHTML += "<div style='color:#777; text-align:center;'>Henüz maç olayı yok.</div>";
    }
}

// 4. Fikstüre Geri Dönüş Fonksiyonu
function closeMatchDetails() {
    document.getElementById('matchDetailView').style.display = 'none';
    document.querySelector('.tab-menu').style.display = 'flex'; // Sekmeleri geri getir
    
    // Hangi sekmedeydiysek oraya geri dön
    if (currentTab === 'standings') {
        document.getElementById('standingsView').style.display = 'block';
    } else {
        document.getElementById('fixturesView').style.display = 'block';
    }
}
