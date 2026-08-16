// ═══════════════════════════════════════════════════════
//         Xynera ⸸ Appeal — WhatsApp Ban Recovery Bot
//                      Author: @Rhvenz
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  INSTALLASI MODULE IMPORTS
// ═══════════════════════════════════════════════════════

const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');
const AdmZip     = require('adm-zip');
const fs         = require('fs');
const path       = require('path');
const { ImapFlow }     = require('imapflow');
const { simpleParser } = require('mailparser');

const logs = require('./XyneraLogs');
const { logBanner, logCommand, logSystem } = logs;
const logInfo  = typeof logs.logInfo  === 'function' ? logs.logInfo  : logSystem;
const logError = typeof logs.logError === 'function' ? logs.logError : logSystem;

const {
    BOT_TOKEN,
    OWNER_IDS,
    CHANNEL_LOG_ID,
    BOT_URL,
    CHANNEL_URL,
    GROUP_URL,
    CONTACT_URL,
    CHANNEL_JOIN,
    GROUP_JOIN1,
    GROUP_JOIN2
} = require('./XyneraSetting');


// ═══════════════════════════════════════════════════════
//  KONFIGURASI INFO BOT — Ubah sesuai kebutuhan
// ═══════════════════════════════════════════════════════

const BOT_INFO = {
    Name      : 'Xynera ⸸ Appeal',
    Version   : '2.0 [ New Update ]',
    Author    : '@Rhvenz',
    Platform  : 'Telegram',
    Language  : 'JavaScript [ Node.js ]',
    Framework : 'Telegraf ⛌ Nodemailer',
};

// ═══════════════════════════════════════════════════════
//  BOT START TIME — Dicatat saat proses pertama kali jalan
// ═══════════════════════════════════════════════════════

const BOT_START_TIME = Date.now();

function getBotUptime() {
    const totalSeconds = Math.floor((Date.now() - BOT_START_TIME) / 1000);
    const days    = Math.floor(totalSeconds / 86400);
    const hours   = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}


// ═════════════════════════════════════
//  DATABASE — Path & File Init
// ═════════════════════════════════════

const DATA_DIR       = path.join(__dirname, 'XyneraDatabase');
const SENDERS_DIR    = path.join(__dirname, 'XyneraSender');
const MEDIA_DIR      = path.join(__dirname, 'XyneraMedia');
const HISTORY_FILE   = path.join(DATA_DIR, 'History.json');
const USERS_FILE     = path.join(DATA_DIR, 'Users.json');

const START_VIDEO = path.join(__dirname, 'XyneraMedia/XyneraIntro.mp4');
const START_MUSIC = path.join(__dirname, 'XyneraMedia/XyneraAudio.mp3');

if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SENDERS_DIR)) fs.mkdirSync(SENDERS_DIR);
if (!fs.existsSync(MEDIA_DIR))   fs.mkdirSync(MEDIA_DIR);
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
if (!fs.existsSync(USERS_FILE))   fs.writeFileSync(USERS_FILE,   JSON.stringify({}));


// ═════════════════════════════════════
//  STATE — Pending user actions (in-memory)
// ═════════════════════════════════════

const userStates = new Map();
// { userId: { action: 'awaiting_add_sender' } }


// ═════════════════════════════════════
//  STATE — Maintenance Mode
// ═════════════════════════════════════

const MAINTENANCE_FILE = path.join(DATA_DIR, 'Maintenance.json');
let maintenanceMode = false;

if (fs.existsSync(MAINTENANCE_FILE)) {
    try {
        const raw = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
        maintenanceMode = raw.active === true;
    } catch { maintenanceMode = false; }
}

function isMaintenanceOn() {
    return maintenanceMode;
}

function setMaintenance(state) {
    maintenanceMode = state;
    fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ active: state }), 'utf8');
}


// ═════════════════════════════════════
//  KONFIGURASI MEDIA
// ═════════════════════════════════════
function hasVideo() {
    return fs.existsSync(START_VIDEO);
}

async function smartEdit(ctx, text, extra) {
    if (hasVideo()) {
        try {
            await ctx.editMessageCaption(text, extra);
        } catch {
            await ctx.editMessageText(text, extra);
        }
    } else {
        try {
            await ctx.editMessageText(text, extra);
        } catch {
            await ctx.editMessageCaption(text, extra);
        }
    }
}


// ═════════════════════════════════════
//  DATABASE — Read / Write Helpers (Per-User Sender, Per-File, Hard Base64)
//
//  Tiap user punya file sendiri:
//    XyneraSender/{userId}.json
//
//  Encoding pipeline (4-layer):
//    1. XOR cipher  — key unik per-user (secret + userId)
//    2. Reverse bytes
//    3. Triple base64 (encode 3x)
//    4. Char substitution  — ganti char standar base64 biar gak obvious
//
//  Decoding = kebalikan step 4 → 1
// ═════════════════════════════════════

const _XK = '\x58\x79\x6e\x65\x72\x61\x40\x53\x65\x63\x23\x32\x30\x32\x35\x21\x5f\x48\x61\x72\x64';

function _xorBuf(buf, key) {
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
        out[i] = buf[i] ^ key.charCodeAt(i % key.length);
    }
    return out;
}

const _SUB_MAP = {
    'A': '\u00a7', '\u00a7': 'A',
    'Z': '\u00b1', '\u00b1': 'Z',
    'a': '\u00a2', '\u00a2': 'a',
    'z': '\u00a3', '\u00a3': 'z',
    '+': '\u00ac', '\u00ac': '+',
    '/': '\u00ae', '\u00ae': '/',
    '=': '\u00bb', '\u00bb': '='
};

function _subChars(str) {
    return str.replace(/[AZaz+/=]/g, c => _SUB_MAP[c] || c);
}

function _restoreChars(str) {
    return str.replace(/[\u00a7\u00b1\u00a2\u00a3\u00ac\u00ae\u00bb]/g, c => _SUB_MAP[c] || c);
}

function _hardEncode(plaintext, userId) {
    const key    = _XK + String(userId);
    const step1  = _xorBuf(Buffer.from(plaintext, 'utf8'), key);
    const step2  = Buffer.from(step1).reverse();
    const step3a = step2.toString('base64');
    const step3b = Buffer.from(step3a, 'utf8').toString('base64');
    const step3c = Buffer.from(step3b, 'utf8').toString('base64');
    return _subChars(step3c);
}

function _hardDecode(encoded, userId) {
    const key    = _XK + String(userId);
    const step3c = _restoreChars(encoded);
    const step3b = Buffer.from(step3c, 'base64').toString('utf8');
    const step3a = Buffer.from(step3b, 'base64').toString('utf8');
    const step2  = Buffer.from(step3a, 'base64');
    const step1  = Buffer.from(step2).reverse();
    const plain  = _xorBuf(step1, key);
    return plain.toString('utf8');
}

function getUserSenderFile(userId) {
    return path.join(SENDERS_DIR, `${String(userId)}.json`);
}

function readUserData(userId) {
    const file = getUserSenderFile(userId);
    if (!fs.existsSync(file)) return { senders: [], rotIdx: 0 };
    try {
        const raw     = fs.readFileSync(file, 'utf8').trim();
        const decoded = _hardDecode(raw, userId);
        const data = JSON.parse(decoded);
        return {
            senders: normalizeSenders(data?.senders),
            rotIdx: Number.isInteger(data?.rotIdx) && data.rotIdx >= 0 ? data.rotIdx : 0
        };
    } catch {
        return { senders: [], rotIdx: 0 };
    }
}

function normalizeSenders(senders) {
    if (!Array.isArray(senders)) return [];
    return senders.filter(s =>
        s &&
        typeof s.user === 'string' &&
        s.user.includes('@') &&
        typeof s.pass === 'string' &&
        s.pass.length > 0
    );
}

function writeUserData(userId, data) {
    const file    = getUserSenderFile(userId);
    const encoded = _hardEncode(JSON.stringify(data), userId);
    fs.writeFileSync(file, encoded, 'utf8');
}

function getUserSenders(userId) {
    return normalizeSenders(readUserData(userId).senders);
}

function saveUserSenders(userId, senders) {
    const data = readUserData(userId);
    data.senders = senders;
    writeUserData(userId, data);
}

// Cursor inbox disimpan bersama data sender agar restart/reconnect tidak
// mengulang email yang sudah ada. `nextUid` adalah UID berikutnya yang
// boleh diproses, bukan UID pesan terakhir.
function getInboxCursor(sender) {
    const cursor = sender && sender.inboxCursor;
    if (!cursor || cursor.initialized !== true) return null;

    const nextUid = Number(cursor.nextUid);
    if (!Number.isSafeInteger(nextUid) || nextUid < 1) return null;

    return {
        uidValidity: cursor.uidValidity == null ? '' : String(cursor.uidValidity),
        nextUid
    };
}

function saveInboxCursor(userId, email, cursor) {
    const data = readUserData(userId);
    const sender = data.senders.find(item => item.user === email);
    if (!sender) return false;

    sender.inboxCursor = {
        initialized: true,
        uidValidity: cursor.uidValidity == null ? '' : String(cursor.uidValidity),
        nextUid: Number(cursor.nextUid)
    };
    writeUserData(userId, data);
    return true;
}

function getNextSenderForUser(userId) {
    const data = readUserData(userId);
    if (!data.senders || data.senders.length === 0) return null;

    const idx      = (data.rotIdx || 0) % data.senders.length;
    const selected = data.senders[idx];
    data.rotIdx    = idx + 1;
    writeUserData(userId, data);

    return { ...selected, idx: idx + 1, total: data.senders.length };
}

function getHistory() {
    try {
        const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

function addHistory(entry) {
    const history = getHistory();
    history.push(entry);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function getUserHistory(userId) {
    return getHistory().filter(h => h.userId === String(userId));
}

function buildLeaderboard() {
    const history = getHistory();
    const users   = getUsers();

    const fixMap = {};
    for (const h of history) {
        const uid = String(h.userId);
        fixMap[uid] = (fixMap[uid] || 0) + 1;
    }

    const ranked = Object.entries(fixMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return ranked.map(function ([uid, fixCount], i) {
        const info        = users[uid] || {};
        const name        = info.name || `User ${uid}`;
        const username    = info.username ? `@${info.username}` : '—';
        const senderCount = (readUserData(uid).senders || []).length;

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

        return { rank: medal, name, username, fixCount, senderCount, uid };
    });
}

function getUsers() {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
    } catch {
        return {};
    }
}

function saveUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function recordUser(from) {
    if (!from || !from.id) return;
    const users = getUsers();
    users[from.id] = {
        name:      from.first_name || '',
        username:  from.username   || '',
        lastSeen:  Date.now()
    };
    saveUsers(users);
}


// ═════════════════════════════════════
//  UTIL — Role Checks
// ═════════════════════════════════════

function isOwner(userId) {
    return OWNER_IDS.includes(userId);
}

function getUserStatusLabel(userId) {
    if (isOwner(userId)) return '👑 Developer';
    return '👤 Reguler';
}


// ═════════════════════════════════════
//  UTIL — Masking Helper
// ═════════════════════════════════════

function maskPhone(phone) {
    phone = String(phone || '');
    return phone.length > 5
        ? phone.slice(0, 3) + '****' + phone.slice(-2)
        : '****';
}

function maskEmail(email) {
    email = String(email || '');
    const [local, domain] = email.split('@');
    return `${(local || '').slice(0, 2)}****@${domain || '***'}`;
}

function maskPass(pass) {
    pass = String(pass || '');
    return pass.length > 4
        ? pass.slice(0, 2) + '****' + pass.slice(-2)
        : '****';
}

function parsePhone(raw) {
    const phone = String(raw || '').trim();
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

// ═════════════════════════════════════
//  UTIL — Email Sender Verification
// ═════════════════════════════════════

function verifySender(user, pass) {
    return new Promise(function (resolve) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000
        });
        const timer = setTimeout(() => resolve({ ok: false, reason: 'SMTP timeout' }), 25000);
        transporter.verify(function (err) {
            clearTimeout(timer);
            if (err) resolve({ ok: false, reason: err.message });
            else     resolve({ ok: true });
        });
    });
}


// ═════════════════════════════════════
//  BOT INIT
// ═════════════════════════════════════

const bot = new Telegraf(BOT_TOKEN);

async function broadcastToOwners(method, ...args) {
    for (const ownerId of OWNER_IDS) {
        try {
            await bot.telegram[method](ownerId, ...args);
        } catch (err) {
            logSystem(`broadcastToOwners ${method} gagal ke ${ownerId}: ${err.message}`);
        }
    }
}


// ═════════════════════════════════════
//  UTIL — Wajib Join Check
// ═════════════════════════════════════

async function getNotJoinedChats(userId) {
    const targets = [
        { label: '📢 Join Channel', url: CHANNEL_JOIN },
        { label: '👥 Join Group',   url: GROUP_JOIN1  },
        { label: '👥 Join Group',   url: GROUP_JOIN2  }
    ];

    const notJoined = [];

    for (const chat of targets) {
        const username = '@' + chat.url.replace('https://t.me/', '');
        try {
            const member = await bot.telegram.getChatMember(username, userId);
            if (['left', 'kicked'].includes(member.status)) {
                notJoined.push(chat);
            }
        } catch {
            notJoined.push(chat);
        }
    }

    return notJoined;
}


// ═════════════════════════════════════
//  AUTO BACKUP — Core Functions
// ═════════════════════════════════════

const BACKUP_INTERVAL_MS      = 60 * 60 * 1000;
const BACKUP_INITIAL_DELAY_MS = 0;

async function runBackup(triggeredBy) {
    const fileName = `Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    const zipPath  = path.join(__dirname, fileName);

    try {
        const zip = new AdmZip();

        ['XyneraDatabase', 'XyneraSender', 'XyneraMedia'].forEach(dir => {
            const full = path.join(__dirname, dir);
            if (fs.existsSync(full)) zip.addLocalFolder(full, dir);
        });

        ['Xynera.js', 'XyneraSetting.js', 'XyneraLogs.js', 'package.json'].forEach(file => {
            const full = path.join(__dirname, file);
            if (fs.existsSync(full)) zip.addLocalFile(full, '', file);
        });

        zip.writeZip(zipPath);
        logSystem(`Zip dibuat: ${fileName} [${triggeredBy || 'auto'}]`);

        const waktu   = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
        const isAuto  = !triggeredBy || triggeredBy === 'auto';
        const caption =
            `<blockquote><b>${isAuto ? '📦 𝗔𝘂𝘁𝗼 𝗕𝗮𝗰𝗸𝘂𝗽' : '📦 𝗠𝗮𝗻𝘂𝗮𝗹 𝗕𝗮𝗰𝗸𝘂𝗽'}</b></blockquote>\n` +
            `<b>━━━━━━━━━━━━━━━━\n` +
            `📁 File   : <code>${fileName}</code>\n` +
            `📅 Waktu  : ${waktu}\n` +
            `📂 Status : Berhasil\n` +
            `━━━━━━━━━━━━━━━━</b>`;

        let successCount = 0;
        for (const ownerId of OWNER_IDS) {
            try {
                await bot.telegram.sendDocument(
                    ownerId,
                    { source: fs.createReadStream(zipPath), filename: fileName },
                    { caption, parse_mode: 'HTML' }
                );
                successCount++;
                logSystem(`Backup terkirim ke owner: ${ownerId}`);
            } catch (err) {
                logSystem(`Gagal kirim ke owner ${ownerId}: ${err.message}`);
            }
        }

        try { fs.unlinkSync(zipPath); } catch (_) {}

        logSystem(`Backup selesai — terkirim ke ${successCount}/${OWNER_IDS.length} owner [${triggeredBy || 'auto'}]`);

        return { ok: true, label: fileName, successCount };

    } catch (err) {
        try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}
        logSystem(`Backup gagal: ${err.message}`);
        return { ok: false, error: err.message };
    }
}

function startAutoBackup() {
    setTimeout(runBackup, BACKUP_INITIAL_DELAY_MS);
    setInterval(runBackup, BACKUP_INTERVAL_MS);
    logSystem('Auto backup aktif — kirim saat start/restart, lalu setiap 1 jam');
}


// ═════════════════════════════════════
//  UI — Appeal Language Options
// ═════════════════════════════════════

const APPEAL_LANGUAGES = {
    EN: { btn: '🇬🇧 English'    },
    ES: { btn: '🇪🇸 Español'   },
    PT: { btn: '🇵🇹 Português'  },
    AR: { btn: '🇸🇦 عربية'     },
    DE: { btn: '🇩🇪 Deutsch'   }
};

// WhatsApp saat ini mengarahkan pengguna ke Request review di aplikasi atau
// formulir Contact WhatsApp. Tidak ada alamat email publik yang dijamin aktif.
// Tujuan dibuat tunggal agar email banding tidak dikirim secara acak ke banyak
// alamat dan tetap mudah diganti jika kanal resmi berubah.
const WA_TARGETS = [
    { label: '📧 WhatsApp Support', email: 'support@support.whatsapp.com' }
];

const CONFIGURED_APPEAL_SUBJECT = {
    EN: 'Regarding the registered number: Login is unavailable',
    ES: 'Sobre el número registrado: el inicio de sesión no está disponible',
    PT: 'Sobre o número registado: o início de sessão não está disponível',
    AR: 'بخصوص الرقم المسجل: تسجيل الدخول غير متاح',
    DE: 'Zur registrierten Nummer: Anmeldung ist nicht verfügbar'
};

function buildConfiguredAppealBody(lang, phone) {
    const bodies = {
        EN:
            `Hello WhatsApp Support Team,\n\n` +
            `I am the rightful owner of the phone number ${phone}. When I try ` +
            `to register or log in to WhatsApp, I receive a message saying ` +
            `that login is unavailable.\n\n` +
            `Please manually review the status of this number and help restore ` +
            `access if there is no violation of the Terms of Service. I am ` +
            `ready to verify ownership through WhatsApp's official support ` +
            `process.\n\n` +
            `Please do not ask me to share an OTP, verification code, or ` +
            `password by email. Thank you for your assistance.\n\n` +
            `Regards,\nThe rightful owner of ${phone}`,

        ES:
            `Estimado equipo de soporte de WhatsApp:\n\n` +
            `Soy el propietario legítimo del número de teléfono ${phone}. ` +
            `Cuando intento registrarme o iniciar sesión en WhatsApp, aparece ` +
            `un mensaje que indica que el inicio de sesión no está disponible.\n\n` +
            `Les solicito que revisen manualmente el estado de este número y ` +
            `me ayuden a recuperar el acceso si no existe ninguna infracción ` +
            `de las Condiciones del servicio. Estoy dispuesto a verificar la ` +
            `titularidad mediante el proceso oficial de soporte de WhatsApp.\n\n` +
            `Por favor, no me soliciten compartir por correo electrónico ningún ` +
            `OTP, código de verificación ni contraseña. Gracias por su ayuda.\n\n` +
            `Atentamente,\nEl propietario legítimo de ${phone}`,

        PT:
            `Olá, equipe de suporte do WhatsApp,\n\n` +
            `Sou o legítimo proprietário do número de telefone ${phone}. Ao ` +
            `tentar cadastrar ou entrar no WhatsApp, recebo uma mensagem ` +
            `informando que o início de sessão não está disponível.\n\n` +
            `Peço que analisem manualmente o estado deste número e me ajudem a ` +
            `recuperar o acesso caso não exista nenhuma violação dos Termos de ` +
            `Serviço. Estou disposto a confirmar a titularidade por meio do ` +
            `processo oficial de suporte do WhatsApp.\n\n` +
            `Por favor, não solicitem que eu compartilhe OTP, código de ` +
            `verificação ou senha por email. Obrigado pela ajuda.\n\n` +
            `Atenciosamente,\nO legítimo proprietário de ${phone}`,

        AR:
            `مرحبًا فريق دعم واتساب،\n\n` +
            `أنا المالك الشرعي لرقم الهاتف ${phone}. عند محاولة تسجيل الرقم ` +
            `أو تسجيل الدخول إلى واتساب، تظهر لي رسالة تفيد بأن تسجيل الدخول ` +
            `غير متاح.\n\n` +
            `أرجو مراجعة حالة هذا الرقم يدويًا ومساعدتي في استعادة الوصول إذا ` +
            `لم يكن هناك أي انتهاك لشروط الخدمة. أنا مستعد لإثبات ملكية الرقم ` +
            `من خلال إجراءات دعم واتساب الرسمية.\n\n` +
            `يرجى عدم مطالبتي بمشاركة رمز OTP أو رمز التحقق أو كلمة المرور عبر ` +
            `البريد الإلكتروني. شكرًا لمساعدتكم.\n\n` +
            `مع خالص التحية،\nالمالك الشرعي للرقم ${phone}`,

        DE:
            `Hallo WhatsApp-Support-Team,\n\n` +
            `Ich bin der rechtmäßige Inhaber der Telefonnummer ${phone}. Wenn ` +
            `ich versuche, mich bei WhatsApp zu registrieren oder anzumelden, ` +
            `erscheint die Meldung, dass die Anmeldung nicht verfügbar ist.\n\n` +
            `Bitte prüfen Sie den Status dieser Nummer manuell und helfen Sie ` +
            `mir, den Zugriff wiederherzustellen, sofern kein Verstoß gegen die ` +
            `Nutzungsbedingungen vorliegt. Ich bin bereit, den Besitz der Nummer ` +
            `über das offizielle WhatsApp-Supportverfahren zu bestätigen.\n\n` +
            `Bitte fordern Sie mich nicht auf, ein OTP, einen Bestätigungscode ` +
            `oder ein Passwort per E-Mail zu teilen. Vielen Dank für Ihre Hilfe.\n\n` +
            `Mit freundlichen Grüßen,\nDer rechtmäßige Inhaber von ${phone}`
    };

    return bodies[lang] || bodies.EN;
}

const APPEAL_SUBJECT = {
    EN: 'URGENT APPEAL: Permanent Account Access Blocked — Immediate Manual Review & Restoration Required for Verified Phone Number',
    ES: 'APELACIÓN URGENTE: Acceso a cuenta bloqueado permanentemente — Se requiere revisión manual inmediata y restauración para número de teléfono verificado',
    PT: 'APELAÇÃO URGENTE: Acesso à conta permanentemente bloqueado — Revisão manual imediata e restauração necessárias para número de telefone verificado',
    AR: 'استئناف عاجل: تم حظر الوصول إلى الحساب بشكل دائم — مطلوب مراجعة يدوية فورية واستعادة الحساب لرقم هاتف موثق',
    DE: 'DRINGENDE BESCHWERDE: Dauerhafter Kontozugriff gesperrt — Sofortige manuelle Prüfung und Wiederherstellung für verifizierte Telefonnummer erforderlich'
};

const APPEAL_SUBJECT_V2 = {
    EN: 'SECOND REVIEW REQUEST: Unable to Register This WhatsApp Number — Please Investigate Verification and Account Status',
    ES: 'SOLICITUD DE REVISIÓN 2: No puedo registrar este número de WhatsApp — Verifiquen el estado de la cuenta',
    PT: 'PEDIDO DE REVISÃO 2: Não consigo registar este número no WhatsApp — Solicito análise do estado da conta',
    AR: 'طلب مراجعة ثانٍ: تعذر تسجيل رقم واتساب — يرجى التحقق من حالة الحساب والتفعيل',
    DE: 'ZWEITE PRÜFUNG: Registrierung dieser WhatsApp-Nummer nicht möglich — Bitte Konto- und Verifizierungsstatus prüfen'
};

function buildAppealBody(lang, phone) {
    const bodies = {
        EN:
            `Dear WhatsApp Trust & Safety / Account Support Team,\n\n` +
            `I am writing this formal appeal to urgently request a manual review and immediate restoration of my WhatsApp account associated with the phone number ${phone}. I am the sole and rightful owner of this number, and I have been completely locked out of my account without any prior warning, notification, or policy violation on my part.\n\n` +
            `─── DESCRIPTION OF THE ISSUE ───\n` +
            `When I attempt to open WhatsApp and verify my phone number ${phone}, the application displays a message stating that "login is unavailable." This error occurs consistently at every login attempt, regardless of the verification method I use (SMS code, voice call, or in-app prompt). The verification code is either never delivered, or when entered correctly, the system still refuses to grant access and continues to display the same restriction message.\n\n` +
            `─── STEPS I HAVE ALREADY ATTEMPTED ───\n` +
            `1. Requested SMS verification code multiple times — no code received or code rejected upon entry.\n` +
            `2. Requested voice call verification — call received but code not accepted.\n` +
            `3. Uninstalled and reinstalled WhatsApp on my device.\n` +
            `4. Cleared app cache and data, then attempted re-registration.\n` +
            `5. Waited 24–48 hours before retrying, as suggested by in-app guidance.\n` +
            `6. Tried from a different device using the same SIM card — same result.\n` +
            `None of these steps resolved the issue. The "login unavailable" restriction persists on every attempt.\n\n` +
            `─── IMPACT OF THIS ISSUE ───\n` +
            `This situation is causing me significant personal and professional disruption. I have lost access to years of important conversations, critical business contacts, active group chats, media files, and documents that are stored solely within my WhatsApp account. My ability to communicate with family, colleagues, and clients has been severely impaired. Every day that passes without access results in ongoing harm to my personal and professional relationships.\n\n` +
            `─── MY FORMAL REQUEST ───\n` +
            `I respectfully request the following actions from your team:\n` +
            `1. Conduct a thorough manual review of the phone number ${phone} and its associated WhatsApp account.\n` +
            `2. Identify the exact technical or administrative reason why login and verification are unavailable.\n` +
            `3. Confirm in writing whether this number is subject to a restriction, suspension, temporary ban, security hold, or technical error.\n` +
            `4. If no Terms of Service violation has occurred, immediately lift any restriction and restore full account access.\n` +
            `5. If a violation is alleged, provide me with the specific policy that was violated, the date of the alleged violation, and a fair opportunity to respond or appeal further.\n` +
            `6. If additional identity verification is required, please provide the official and secure process through which I can submit proof of ownership.\n\n` +
            `─── DECLARATION OF OWNERSHIP ───\n` +
            `I hereby declare under good faith that:\n` +
            `• I am the legal owner and primary user of the phone number ${phone}.\n` +
            `• I have not violated WhatsApp's Terms of Service or Community Guidelines to the best of my knowledge.\n` +
            `• I have not shared my account with third parties or used any unauthorized third-party WhatsApp clients.\n` +
            `• I have not engaged in spam, bulk messaging, harassment, or any prohibited activity.\n` +
            `• I am prepared to verify my identity through any official channel WhatsApp provides.\n\n` +
            `Important: Please do not request that I share any OTP, verification code, or password via email. I will only provide sensitive verification data through a secure, official WhatsApp process.\n\n` +
            `─── CLOSING ───\n` +
            `I trust that WhatsApp's support team will review this appeal fairly and promptly. This account represents years of communication history and is deeply important to me. I am fully cooperative and ready to provide any documentation or information required to resolve this matter as quickly as possible.\n\n` +
            `Thank you sincerely for your time, attention, and assistance.\n\n` +
            `Respectfully yours,\n` +
            `The verified owner of phone number ${phone}`,

        ES:
            `Estimado equipo de Confianza, Seguridad y Soporte de Cuentas de WhatsApp,\n\n` +
            `Me dirijo a ustedes mediante esta apelación formal para solicitar urgentemente una revisión manual y la restauración inmediata de mi cuenta de WhatsApp asociada al número de teléfono ${phone}. Soy el único propietario legítimo de este número y he perdido completamente el acceso a mi cuenta sin previo aviso, notificación ni infracción de mi parte.\n\n` +
            `─── DESCRIPCIÓN DEL PROBLEMA ───\n` +
            `Cada vez que intento abrir WhatsApp y verificar mi número ${phone}, la aplicación muestra el mensaje "inicio de sesión no disponible". Este error se produce de forma constante en cada intento de inicio de sesión, independientemente del método de verificación que utilice (código SMS, llamada de voz o notificación dentro de la app). El código de verificación nunca llega o, cuando se ingresa correctamente, el sistema sigue negando el acceso y muestra el mismo mensaje de restricción.\n\n` +
            `─── PASOS YA INTENTADOS ───\n` +
            `1. Solicité el código de verificación por SMS en múltiples ocasiones — no se recibió o fue rechazado al ingresarlo.\n` +
            `2. Solicité la verificación por llamada de voz — la llamada se recibió pero el código no fue aceptado.\n` +
            `3. Desinstalé y reinstalé WhatsApp en mi dispositivo.\n` +
            `4. Borré la caché y los datos de la aplicación, luego intenté el registro nuevamente.\n` +
            `5. Esperé 24–48 horas antes de volver a intentarlo, como sugiere la guía dentro de la app.\n` +
            `6. Lo intenté desde un dispositivo diferente con la misma tarjeta SIM — mismo resultado.\n` +
            `Ninguno de estos pasos resolvió el problema. La restricción "inicio de sesión no disponible" persiste en cada intento.\n\n` +
            `─── IMPACTO DEL PROBLEMA ───\n` +
            `Esta situación me está causando una grave interrupción personal y profesional. He perdido acceso a años de conversaciones importantes, contactos de negocios críticos, chats grupales activos, archivos multimedia y documentos almacenados únicamente en mi cuenta de WhatsApp. Mi capacidad para comunicarme con familiares, colegas y clientes se ha visto gravemente afectada.\n\n` +
            `─── MI SOLICITUD FORMAL ───\n` +
            `Solicito respetuosamente las siguientes acciones:\n` +
            `1. Realizar una revisión manual exhaustiva del número ${phone} y su cuenta de WhatsApp asociada.\n` +
            `2. Identificar el motivo técnico o administrativo exacto por el que el inicio de sesión y la verificación no están disponibles.\n` +
            `3. Confirmar por escrito si este número está sujeto a restricción, suspensión, bloqueo temporal, retención de seguridad o error técnico.\n` +
            `4. Si no se ha producido ninguna infracción de los Términos de Servicio, levantar inmediatamente cualquier restricción y restaurar el acceso completo a la cuenta.\n` +
            `5. Si se alega una infracción, proporcionar la política específica que fue violada, la fecha de la supuesta infracción y la oportunidad de responder o apelar.\n` +
            `6. Si se requiere verificación de identidad adicional, indicar el proceso oficial y seguro para presentar la prueba de titularidad.\n\n` +
            `─── DECLARACIÓN DE TITULARIDAD ───\n` +
            `Por medio de la presente declaro de buena fe que:\n` +
            `• Soy el propietario legal y usuario principal del número de teléfono ${phone}.\n` +
            `• No he infringido los Términos de Servicio ni las Directrices de la Comunidad de WhatsApp que yo sepa.\n` +
            `• No he compartido mi cuenta con terceros ni utilizado clientes de WhatsApp no autorizados.\n` +
            `• No he realizado spam, mensajes masivos, acoso ni ninguna actividad prohibida.\n` +
            `• Estoy preparado para verificar mi identidad a través de cualquier canal oficial que WhatsApp proporcione.\n\n` +
            `Importante: Por favor, no soliciten que comparta ningún OTP, código de verificación o contraseña por correo electrónico.\n\n` +
            `─── CIERRE ───\n` +
            `Confío en que el equipo de soporte de WhatsApp revisará esta apelación de manera justa y oportuna. Estoy completamente dispuesto a proporcionar cualquier documentación o información necesaria para resolver este asunto lo antes posible.\n\n` +
            `Muchas gracias por su tiempo, atención y asistencia.\n\n` +
            `Atentamente,\n` +
            `El propietario verificado del número de teléfono ${phone}`,

        PT:
            `Prezada Equipa de Confiança, Segurança e Suporte de Contas do WhatsApp,\n\n` +
            `Escrevo esta apelação formal para solicitar urgentemente uma revisão manual e a restauração imediata da minha conta WhatsApp associada ao número de telefone ${phone}. Sou o único proprietário legítimo deste número e fui completamente impedido de aceder à minha conta sem qualquer aviso prévio, notificação ou infração da minha parte.\n\n` +
            `─── DESCRIÇÃO DO PROBLEMA ───\n` +
            `Sempre que tento abrir o WhatsApp e verificar o meu número ${phone}, a aplicação apresenta a mensagem "início de sessão não disponível". Este erro ocorre de forma consistente em cada tentativa de início de sessão, independentemente do método de verificação utilizado (código SMS, chamada de voz ou notificação na app). O código de verificação nunca é entregue ou, quando introduzido corretamente, o sistema continua a recusar o acesso.\n\n` +
            `─── PASSOS JÁ TENTADOS ───\n` +
            `1. Solicitei o código de verificação por SMS várias vezes — não foi recebido ou foi rejeitado ao ser introduzido.\n` +
            `2. Solicitei a verificação por chamada de voz — a chamada foi recebida, mas o código não foi aceite.\n` +
            `3. Desinstalei e reinstalei o WhatsApp no meu dispositivo.\n` +
            `4. Limpei a cache e os dados da aplicação e tentei o registo novamente.\n` +
            `5. Aguardei 24–48 horas antes de tentar novamente, conforme sugerido pela orientação na app.\n` +
            `6. Tentei a partir de um dispositivo diferente com o mesmo cartão SIM — mesmo resultado.\n` +
            `Nenhum destes passos resolveu o problema. A restrição "início de sessão não disponível" persiste em todas as tentativas.\n\n` +
            `─── IMPACTO DO PROBLEMA ───\n` +
            `Esta situação está a causar-me uma perturbação pessoal e profissional significativa. Perdi o acesso a anos de conversas importantes, contactos de negócios críticos, chats de grupo ativos, ficheiros multimédia e documentos armazenados exclusivamente na minha conta WhatsApp.\n\n` +
            `─── O MEU PEDIDO FORMAL ───\n` +
            `Solicito respeitosamente as seguintes ações:\n` +
            `1. Realizar uma revisão manual exaustiva do número ${phone} e da sua conta WhatsApp associada.\n` +
            `2. Identificar o motivo técnico ou administrativo exato pelo qual o início de sessão e a verificação não estão disponíveis.\n` +
            `3. Confirmar por escrito se este número está sujeito a restrição, suspensão, bloqueio temporário, retenção de segurança ou erro técnico.\n` +
            `4. Se não ocorreu qualquer violação dos Termos de Serviço, levantar imediatamente qualquer restrição e restaurar o acesso completo à conta.\n` +
            `5. Se for alegada uma violação, fornecer a política específica que foi violada e a oportunidade de responder ou apelar.\n` +
            `6. Se for necessária verificação de identidade adicional, indicar o processo oficial e seguro para apresentar prova de titularidade.\n\n` +
            `─── DECLARAÇÃO DE TITULARIDADE ───\n` +
            `Declaro de boa-fé que:\n` +
            `• Sou o proprietário legal e utilizador principal do número de telefone ${phone}.\n` +
            `• Não violei os Termos de Serviço nem as Diretrizes da Comunidade do WhatsApp do meu conhecimento.\n` +
            `• Não partilhei a minha conta com terceiros nem utilizei clientes WhatsApp não autorizados.\n` +
            `• Não realizei spam, mensagens em massa, assédio nem qualquer atividade proibida.\n` +
            `• Estou pronto para verificar a minha identidade através de qualquer canal oficial que o WhatsApp disponibilize.\n\n` +
            `Importante: Por favor, não solicitem que partilhe qualquer OTP, código de verificação ou palavra-passe por e-mail.\n\n` +
            `─── CONCLUSÃO ───\n` +
            `Confio que a equipa de suporte do WhatsApp analisará esta apelação de forma justa e atempada. Estou totalmente disponível para fornecer qualquer documentação ou informação necessária para resolver este assunto o mais rapidamente possível.\n\n` +
            `Muito obrigado pelo vosso tempo, atenção e assistência.\n\n` +
            `Com os melhores cumprimentos,\n` +
            `O proprietário verificado do número de telefone ${phone}`,

        AR:
            `إلى فريق الثقة والأمان ودعم الحسابات في واتساب المحترم،\n\n` +
            `أتقدم بهذا الاستئناف الرسمي لطلب مراجعة يدوية عاجلة واستعادة فورية لحسابي على واتساب المرتبط برقم الهاتف ${phone}. أنا المالك الشرعي الوحيد لهذا الرقم، وقد تعذّر عليّ الوصول إلى حسابي تمامًا دون أي إشعار مسبق أو إخطار أو انتهاك من جانبي.\n\n` +
            `─── وصف المشكلة ───\n` +
            `في كل مرة أحاول فيها فتح واتساب والتحقق من رقمي ${phone}، يعرض التطبيق رسالة "تسجيل الدخول غير متاح". يحدث هذا الخطأ باستمرار في كل محاولة تسجيل دخول، بصرف النظر عن طريقة التحقق التي أستخدمها (رمز SMS، مكالمة صوتية، أو إشعار داخل التطبيق). إما أن رمز التحقق لا يُسلَّم أبدًا، أو عند إدخاله بشكل صحيح يستمر النظام في رفض منح الوصول.\n\n` +
            `─── الخطوات التي جربتها بالفعل ───\n` +
            `1. طلبت رمز التحقق عبر SMS عدة مرات — لم يُستلم أو رُفض عند إدخاله.\n` +
            `2. طلبت التحقق عبر المكالمة الصوتية — وصلت المكالمة لكن الرمز لم يُقبل.\n` +
            `3. قمت بإلغاء تثبيت واتساب وإعادة تثبيته على جهازي.\n` +
            `4. مسحت ذاكرة التخزين المؤقت وبيانات التطبيق، ثم حاولت إعادة التسجيل.\n` +
            `5. انتظرت من 24 إلى 48 ساعة قبل إعادة المحاولة، كما أشارت التعليمات داخل التطبيق.\n` +
            `6. حاولت من جهاز مختلف باستخدام نفس شريحة SIM — نفس النتيجة.\n` +
            `لم تُحل أيٌّ من هذه الخطوات المشكلة. ولا تزال قيود "تسجيل الدخول غير متاح" مستمرة في كل محاولة.\n\n` +
            `─── تأثير المشكلة ───\n` +
            `يتسبب هذا الوضع في اضطراب شخصي ومهني بالغ. لقد فقدت الوصول إلى سنوات من المحادثات المهمة، وجهات الاتصال التجارية الحيوية، ومجموعات الدردشة النشطة، والملفات الإعلامية والوثائق المخزنة حصريًا في حسابي على واتساب.\n\n` +
            `─── طلبي الرسمي ───\n` +
            `أطلب باحترام اتخاذ الإجراءات التالية:\n` +
            `1. إجراء مراجعة يدوية شاملة لرقم الهاتف ${phone} وحسابه المرتبط على واتساب.\n` +
            `2. تحديد السبب التقني أو الإداري الدقيق لعدم توفر تسجيل الدخول والتحقق.\n` +
            `3. التأكيد كتابيًا على ما إذا كان هذا الرقم خاضعًا لقيد أو تعليق أو حظر مؤقت أو تجميد أمني أو خطأ تقني.\n` +
            `4. في حال عدم وجود أي انتهاك لشروط الخدمة، رفع أي قيود فورًا واستعادة الوصول الكامل للحساب.\n` +
            `5. في حال ادعاء انتهاك، تزويدي بالسياسة المحددة التي انتُهكت وتاريخ الانتهاك المزعوم وفرصة للرد أو الاستئناف.\n` +
            `6. إذا كان التحقق من الهوية مطلوبًا، يُرجى توضيح الإجراء الرسمي والآمن لتقديم إثبات الملكية.\n\n` +
            `─── إقرار الملكية ───\n` +
            `أُقرّ بحسن نية بما يلي:\n` +
            `• أنا المالك القانوني والمستخدم الأساسي لرقم الهاتف ${phone}.\n` +
            `• لم أنتهك شروط خدمة واتساب أو إرشادات المجتمع فيما أعلم.\n` +
            `• لم أشارك حسابي مع أطراف ثالثة أو استخدام عملاء واتساب غير معتمدين.\n` +
            `• لم أقم بالبريد العشوائي أو الرسائل الجماعية أو المضايقة أو أي نشاط محظور.\n` +
            `• أنا مستعد للتحقق من هويتي عبر أي قناة رسمية يوفرها واتساب.\n\n` +
            `هام: لا تطلبوا مني مشاركة أي رمز OTP أو رمز تحقق أو كلمة مرور عبر البريد الإلكتروني.\n\n` +
            `─── الخاتمة ───\n` +
            `أثق بأن فريق دعم واتساب سيراجع هذا الاستئناف بنزاهة وسرعة. أنا متعاون تمامًا ومستعد لتقديم أي وثائق أو معلومات ضرورية لحل هذه المسألة في أقرب وقت ممكن.\n\n` +
            `شكرًا جزيلًا على وقتكم واهتمامكم ومساعدتكم.\n\n` +
            `مع خالص الاحترام والتقدير،\n` +
            `المالك الموثق لرقم الهاتف ${phone}`,

        DE:
            `Sehr geehrtes Team für Vertrauen, Sicherheit und Kontobetreuung von WhatsApp,\n\n` +
            `Ich wende mich mit dieser formellen Beschwerde an Sie, um dringend eine manuelle Überprüfung und die sofortige Wiederherstellung meines WhatsApp-Kontos zu beantragen, das mit der Telefonnummer ${phone} verknüpft ist. Ich bin der alleinige rechtmäßige Inhaber dieser Nummer und war ohne Vorwarnung, Benachrichtigung oder Richtlinienverletzung meinerseits vollständig von meinem Konto ausgesperrt.\n\n` +
            `─── PROBLEMBESCHREIBUNG ───\n` +
            `Wenn ich versuche, WhatsApp zu öffnen und meine Nummer ${phone} zu verifizieren, zeigt die App die Meldung „Anmeldung nicht verfügbar" an. Dieser Fehler tritt bei jedem Anmeldeversuch konsistent auf, unabhängig von der verwendeten Verifizierungsmethode (SMS-Code, Sprachanruf oder In-App-Benachrichtigung). Der Verifizierungscode wird entweder nie zugestellt oder, wenn er korrekt eingegeben wird, verweigert das System weiterhin den Zugang.\n\n` +
            `─── BEREITS UNTERNOMMENE SCHRITTE ───\n` +
            `1. Ich habe den SMS-Verifizierungscode mehrfach angefordert — er wurde nicht empfangen oder bei der Eingabe abgelehnt.\n` +
            `2. Ich habe die Verifizierung per Sprachanruf angefordert — der Anruf kam an, aber der Code wurde nicht akzeptiert.\n` +
            `3. Ich habe WhatsApp auf meinem Gerät deinstalliert und neu installiert.\n` +
            `4. Ich habe App-Cache und -Daten gelöscht und dann eine erneute Registrierung versucht.\n` +
            `5. Ich habe 24–48 Stunden gewartet, bevor ich es erneut versucht habe, wie in der In-App-Anleitung empfohlen.\n` +
            `6. Ich habe es von einem anderen Gerät mit derselben SIM-Karte versucht — gleiches Ergebnis.\n` +
            `Keiner dieser Schritte hat das Problem gelöst. Die Einschränkung „Anmeldung nicht verfügbar" bleibt bei jedem Versuch bestehen.\n\n` +
            `─── AUSWIRKUNGEN DES PROBLEMS ───\n` +
            `Diese Situation verursacht mir erhebliche persönliche und berufliche Störungen. Ich habe den Zugang zu jahrelangen wichtigen Gesprächen, kritischen Geschäftskontakten, aktiven Gruppenunterhaltungen, Mediendateien und Dokumenten verloren, die ausschließlich in meinem WhatsApp-Konto gespeichert sind.\n\n` +
            `─── MEIN FORMELLER ANTRAG ───\n` +
            `Ich bitte respektvoll um folgende Maßnahmen:\n` +
            `1. Durchführung einer gründlichen manuellen Überprüfung der Telefonnummer ${phone} und des zugehörigen WhatsApp-Kontos.\n` +
            `2. Identifizierung des genauen technischen oder administrativen Grundes, warum Anmeldung und Verifizierung nicht verfügbar sind.\n` +
            `3. Schriftliche Bestätigung, ob diese Nummer einer Einschränkung, Sperrung, vorübergehenden Sperre, Sicherheitssperre oder einem technischen Fehler unterliegt.\n` +
            `4. Falls kein Verstoß gegen die Nutzungsbedingungen vorliegt, sofortige Aufhebung aller Einschränkungen und Wiederherstellung des vollständigen Kontozugangs.\n` +
            `5. Falls ein Verstoß behauptet wird, Mitteilung der spezifischen verletzten Richtlinie, des Datums des angeblichen Verstoßes und die Möglichkeit zur Stellungnahme oder weiteren Beschwerde.\n` +
            `6. Falls eine zusätzliche Identitätsprüfung erforderlich ist, bitte das offizielle und sichere Verfahren mitteilen, über das ich einen Eigentumsnachweis einreichen kann.\n\n` +
            `─── EIGENTUMSERKLÄRUNG ───\n` +
            `Hiermit erkläre ich in gutem Glauben:\n` +
            `• Ich bin der rechtmäßige Eigentümer und Hauptnutzer der Telefonnummer ${phone}.\n` +
            `• Ich habe nach bestem Wissen die Nutzungsbedingungen und Community-Richtlinien von WhatsApp nicht verletzt.\n` +
            `• Ich habe mein Konto nicht mit Dritten geteilt oder nicht autorisierte WhatsApp-Clients verwendet.\n` +
            `• Ich habe kein Spam, keine Massennachrichten, Belästigungen oder verbotene Aktivitäten durchgeführt.\n` +
            `• Ich bin bereit, meine Identität über jeden offiziellen Kanal zu verifizieren, den WhatsApp anbietet.\n\n` +
            `Wichtig: Bitte fordern Sie mich nicht auf, einen OTP, Verifizierungscode oder ein Passwort per E-Mail zu teilen.\n\n` +
            `─── ABSCHLUSS ───\n` +
            `Ich vertraue darauf, dass das WhatsApp-Support-Team diese Beschwerde fair und prompt prüfen wird. Ich bin vollständig kooperativ und bereit, alle erforderlichen Unterlagen oder Informationen bereitzustellen, um diese Angelegenheit so schnell wie möglich zu lösen.\n\n` +
            `Vielen Dank für Ihre Zeit, Aufmerksamkeit und Unterstützung.\n\n` +
            `Mit freundlichen Grüßen,\n` +
            `Der verifizierte Inhaber der Telefonnummer ${phone}`
    };
    return bodies[lang] || bodies.ES;
}

function buildAppealBodyV2(lang, phone) {
    const bodies = {
        EN:
            `Hello WhatsApp Support Team,\n\n` +
            `I am requesting a second review of the registration and verification status for the WhatsApp number ${phone}. I can no longer complete the normal registration process and need clarification about the current status of this number.\n\n` +
            `─── REGISTRATION REPORT ───\n` +
            `The number ${phone} is active and belongs to me, but WhatsApp does not complete the sign-in or verification flow. The process may stop after the code request, reject a valid code, or return an unavailable-registration message.\n\n` +
            `─── TROUBLESHOOTING COMPLETED ───\n` +
            `I checked the phone signal and internet connection, updated WhatsApp, restarted the device, retried the available verification method, and waited before trying again. The same registration problem remains.\n\n` +
            `─── REQUEST FOR CLARIFICATION ───\n` +
            `Please check whether the number has a temporary security flag, a registration limit, an incorrect account status, or another technical issue. If an action is required from me, please explain the official steps clearly.\n\n` +
            `I am ready to confirm ownership through WhatsApp's official support process. Please do not request an OTP, verification code, or password by email.\n\n` +
            `Thank you for reviewing this second request.\n\n` +
            `Regards,\nThe verified owner of ${phone}`,

        ES:
            `Estimado equipo de soporte de WhatsApp:\n\n` +
            `Solicito una segunda revisión del estado de registro y verificación del número ${phone}. Ya no puedo completar el proceso normal de registro y necesito saber cuál es el estado actual de este número.\n\n` +
            `─── INFORME DE REGISTRO ───\n` +
            `El número ${phone} está activo y me pertenece, pero WhatsApp no completa el acceso ni la verificación. El proceso puede detenerse después de solicitar el código, rechazar un código válido o mostrar un mensaje de registro no disponible.\n\n` +
            `─── COMPROBACIONES REALIZADAS ───\n` +
            `Comprobé la señal y la conexión a internet, actualicé WhatsApp, reinicié el dispositivo, probé el método de verificación disponible y esperé antes de intentarlo nuevamente. El problema continúa.\n\n` +
            `─── SOLICITUD DE ACLARACIÓN ───\n` +
            `Por favor, comprueben si existe una medida de seguridad temporal, un límite de registro, un estado incorrecto de la cuenta u otro problema técnico. Si debo realizar alguna acción, indiquen los pasos oficiales.\n\n` +
            `Estoy dispuesto a confirmar la titularidad mediante el proceso oficial de WhatsApp. No soliciten OTP, código de verificación ni contraseña por correo electrónico.\n\n` +
            `Gracias por revisar esta segunda solicitud.\n\nAtentamente,\nEl propietario verificado de ${phone}`,

        PT:
            `Prezada equipa de suporte do WhatsApp,\n\n` +
            `Solicito uma segunda análise do estado de registo e verificação do número ${phone}. Já não consigo concluir o processo normal de registo e preciso de esclarecimentos sobre o estado atual deste número.\n\n` +
            `─── RELATÓRIO DE REGISTO ───\n` +
            `O número ${phone} está ativo e pertence-me, mas o WhatsApp não conclui o acesso ou a verificação. O processo pode parar depois do pedido do código, rejeitar um código válido ou apresentar uma mensagem de registo indisponível.\n\n` +
            `─── VERIFICAÇÕES REALIZADAS ───\n` +
            `Verifiquei o sinal e a ligação à internet, atualizei o WhatsApp, reiniciei o dispositivo, tentei o método de verificação disponível e aguardei antes de repetir. O problema mantém-se.\n\n` +
            `─── PEDIDO DE ESCLARECIMENTO ───\n` +
            `Peço que verifiquem se existe uma proteção temporária, um limite de registo, um estado incorreto da conta ou outro problema técnico. Se for necessária alguma ação da minha parte, indiquem os passos oficiais.\n\n` +
            `Estou disponível para confirmar a titularidade através do processo oficial do WhatsApp. Não solicitem OTP, código de verificação ou palavra-passe por e-mail.\n\n` +
            `Obrigado por analisarem este segundo pedido.\n\nCom os melhores cumprimentos,\nO proprietário verificado de ${phone}`,

        AR:
            `إلى فريق دعم واتساب المحترم،\n\n` +
            `أطلب مراجعة ثانية لحالة تسجيل والتحقق من رقم واتساب ${phone}. لم أعد قادرًا على إكمال عملية التسجيل المعتادة وأحتاج إلى توضيح حالة هذا الرقم حاليًا.\n\n` +
            `─── تقرير التسجيل ───\n` +
            `الرقم ${phone} نشط ومملوك لي، لكن واتساب لا يكمل عملية الدخول أو التحقق. قد تتوقف العملية بعد طلب الرمز، أو ترفض رمزًا صحيحًا، أو تعرض رسالة تفيد بأن التسجيل غير متاح.\n\n` +
            `─── الفحوصات التي أُجريت ───\n` +
            `تحققت من إشارة الهاتف والاتصال بالإنترنت، وحدّثت واتساب، وأعدت تشغيل الجهاز، وجربت طريقة التحقق المتاحة، وانتظرت قبل المحاولة مرة أخرى. وما زالت المشكلة قائمة.\n\n` +
            `─── طلب التوضيح ───\n` +
            `يرجى التحقق مما إذا كان هناك إجراء أمني مؤقت أو حد للتسجيل أو حالة حساب غير صحيحة أو مشكلة تقنية أخرى. إذا كان مطلوبًا مني إجراء معين، يرجى توضيح الخطوات الرسمية.\n\n` +
            `أنا مستعد لإثبات ملكية الرقم عبر إجراء واتساب الرسمي. يرجى عدم طلب رمز OTP أو رمز التحقق أو كلمة المرور عبر البريد الإلكتروني.\n\n` +
            `شكرًا لمراجعة هذا الطلب الثاني.\n\nمع خالص التحية،\nالمالك الموثق للرقم ${phone}`,

        DE:
            `Sehr geehrtes WhatsApp-Support-Team,\n\n` +
            `ich bitte um eine zweite Prüfung des Registrierungs- und Verifizierungsstatus der WhatsApp-Nummer ${phone}. Ich kann die normale Registrierung nicht mehr abschließen und benötige eine Erklärung zum aktuellen Status dieser Nummer.\n\n` +
            `─── REGISTRIERUNGSBERICHT ───\n` +
            `Die Nummer ${phone} ist aktiv und gehört mir, aber WhatsApp beendet die Anmeldung oder Verifizierung nicht. Der Vorgang kann nach der Code-Anforderung abbrechen, einen gültigen Code ablehnen oder eine Meldung anzeigen, dass die Registrierung nicht verfügbar ist.\n\n` +
            `─── DURCHGEFÜHRTE PRÜFUNGEN ───\n` +
            `Ich habe Empfang und Internetverbindung geprüft, WhatsApp aktualisiert, das Gerät neu gestartet, die verfügbare Verifizierungsmethode erneut versucht und vor einem weiteren Versuch gewartet. Das Problem besteht weiterhin.\n\n` +
            `─── BITTE UM KLÄRUNG ───\n` +
            `Bitte prüfen Sie, ob eine vorübergehende Sicherheitsmaßnahme, ein Registrierungslimit, ein falscher Kontostatus oder ein anderes technisches Problem vorliegt. Falls ich etwas tun muss, nennen Sie mir bitte die offiziellen Schritte.\n\n` +
            `Ich bin bereit, den Besitz der Nummer über den offiziellen WhatsApp-Prozess zu bestätigen. Bitte fordern Sie OTP, Verifizierungscode oder Passwort nicht per E-Mail an.\n\n` +
            `Vielen Dank für die Prüfung dieser zweiten Anfrage.\n\nMit freundlichen Grüßen,\nDer verifizierte Inhaber von ${phone}`
    };
    return bodies[lang] || bodies.ES;
}


// ═════════════════════════════════════
//  UI — Join Prompt Builder
// ═════════════════════════════════════

function buildJoinKeyboard(notJoined) {
    const hasChat = (url) => notJoined.some(c => c.url === url);
    const rows = [];

    if (hasChat(CHANNEL_JOIN)) {
        rows.push([{ text: '📢 Join Channel', url: CHANNEL_JOIN, style: 'success' }]);
    }

    const groupRow = [];
    if (hasChat(GROUP_JOIN1)) groupRow.push({ text: '👥 Join Group', url: GROUP_JOIN1, style: 'primary' });
    if (hasChat(GROUP_JOIN2)) groupRow.push({ text: '👥 Join Group', url: GROUP_JOIN2, style: 'primary' });
    if (groupRow.length > 0)  rows.push(groupRow);

    rows.push([{ text: '✅ Verification', callback_data: 'check_join', style: 'success' }]);

    return Markup.inlineKeyboard(rows);
}

async function sendJoinPrompt(ctx, notJoined) {
    const list = notJoined.map(c => `• ${c.label}`).join('\n');
    const text =
`<blockquote><b>🚫 𝗔𝗸𝘀𝗲𝘀 𝗗𝗶𝘁𝗼𝗹𝗮𝗸!</b></blockquote>
<b>Kamu harus bergabung ke semua channel dan group berikut untuk menggunakan bot ini.

━━━━━━━━━━━━━━━━
📌 Belum Join:
${list}
━━━━━━━━━━━━━━━━

Klik tombol di bawah untuk join, lalu tekan Sudah Join, Cek Ulang.</b>`;

    await ctx.reply(text, {
        parse_mode: 'HTML',
        ...buildJoinKeyboard(notJoined)
    });
}


// ═════════════════════════════════════
//  UI — Start Message Content
// ═════════════════════════════════════

function buildStartCaption(ctx) {
    const statusLabel = getUserStatusLabel(ctx.from.id);
    const mention  = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;
    const uptime   = getBotUptime();

    return (
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗔𝗣𝗣𝗘𝗔𝗟</b></blockquote>
<b>─ Hello, Friend!!
☇ Name: ${mention}
☇ UserID: <code>${ctx.from.id}</code>
☇ Status: ${statusLabel}
I Am A Telegram Bot Ready To Help You.</b>

<blockquote><b>( 🍁 ) 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻 ― 𝗕𝗼𝘁</b></blockquote>
<b>☇ Name: ${BOT_INFO.Name}
☇ Version: ${BOT_INFO.Version}
☇ Author: ${BOT_INFO.Author}
☇ Platform: ${BOT_INFO.Platform}
☇ Language: ${BOT_INFO.Language}
☇ Framework: ${BOT_INFO.Framework}
☇ Uptime: ${uptime}</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`
    );
}

function buildStartKeyboard() {
    return Markup.inlineKeyboard([
        [
            { text: '📋 All Menu', callback_data: 'all_menu', style: 'primary' }
        ],
        [
            { text: '❓ Help',     callback_data: 'help_p1',  style: 'primary' }
        ],
        [
            { text: '📢 Channel',  url: CHANNEL_URL, style: 'success' },
            { text: '👥 Group',    url: GROUP_URL,   style: 'success' }
        ],
        [{ text: '👨‍💻 Developer', url: CONTACT_URL, style: 'danger' }]
    ]);
}

async function sendStartMessage(ctx) {
    if (!isOwner(ctx.from.id)) {
        const notJoined = await getNotJoinedChats(ctx.from.id);
        if (notJoined.length > 0) return sendJoinPrompt(ctx, notJoined);
    }

    if (hasVideo()) {
        await ctx.replyWithVideo(
            { source: fs.createReadStream(START_VIDEO) },
            {
                caption:    buildStartCaption(ctx),
                parse_mode: 'HTML',
                ...buildStartKeyboard()
            }
        );

        setTimeout(async function () {
            if (!fs.existsSync(START_MUSIC)) return;
            try {
                await ctx.replyWithAudio(
                    { source: fs.createReadStream(START_MUSIC) },
                    {
                        title:      'Татьяна Куртукова',
                        performer:  'Матушка',
                        caption:    '<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>',
                        parse_mode: 'HTML'
                    }
                );
            } catch {}
        }, 1000);
    } else {
        await ctx.reply(buildStartCaption(ctx), {
            parse_mode: 'HTML',
            ...buildStartKeyboard()
        });
    }
}

async function editToStartMessage(ctx) {
    await smartEdit(ctx, buildStartCaption(ctx), {
        parse_mode: 'HTML',
        ...buildStartKeyboard()
    });
}


// ═════════════════════════════════════
//  UI — All Menu Content
// ═════════════════════════════════════

function buildAllMenuCaption(ctx) {
    const statusLabel = getUserStatusLabel(ctx.from.id);
    const mention     = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;
    const uptime      = getBotUptime();
    const mySenders = getUserSenders(ctx.from.id);

    return (
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗔𝗣𝗣𝗘𝗔𝗟</b></blockquote>
<b>─ Hello, Friend!!
☇ Name: ${mention}
☇ UserID: <code>${ctx.from.id}</code>
☇ Status: ${statusLabel}
I Am A Telegram Bot Ready To Help You.</b>

<blockquote><b>( 🍁 ) 𝗜𝗻𝗳𝗼𝗿𝗺𝗮𝘁𝗶𝗼𝗻 ― 𝗦𝘁𝗮𝘁𝘂𝘀</b></blockquote>
<b>☇ Sender: ${mySenders.length} Email
☇ Uptime: ${uptime}</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`
    );
}

function buildAllMenuKeyboard(ctx) {
    const rows = [
        [
            { text: '🔗 Connect', callback_data: 'connect_menu', style: 'success' },
            { text: '🔧 Service', callback_data: 'service_menu',    style: 'success' }
        ]
    ];

    if (isOwner(ctx.from.id)) {
        rows.push([{ text: '⚙️ Manage', callback_data: 'manage_menu', style: 'danger' }]);
    }

    rows.push([{ text: '🏠 Start Menu', callback_data: 'back_start', style: 'primary' }]);

    return Markup.inlineKeyboard(rows);
}


// ═════════════════════════════════════
//  UI — Sender Menu Builder
// ═════════════════════════════════════

function buildSenderMenuText(ctx) {
    const uid        = ctx.from.id;
    const mySenders  = getUserSenders(uid);
    const fixCount   = getUserHistory(String(uid)).length;
    const statusLabel = getUserStatusLabel(uid);
    const mention    = `<a href="tg://user?id=${uid}">${ctx.from.first_name}</a>`;
    const username   = ctx.from.username ? `@${ctx.from.username}` : '—';

    const senderInfo = mySenders.length === 0
        ? '⚠️ Belum ada sender'
        : `${mySenders.length} email terdaftar`;

    return (
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>─ Hello, ${mention}!
━━━━━━━━━━━━━━━━
☇ Username  : ${username}
☇ UserID    : <code>${uid}</code>
☇ Status    : ${statusLabel}
━━━━━━━━━━━━━━━━
📧 Sender   : ${senderInfo}
🔧 Fixed    : ${fixCount}x
━━━━━━━━━━━━━━━━

Kelola email sender pribadi kamu di sini.
Sender digunakan untuk mengirim banding ke WhatsApp.</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`
    );
}

function buildSenderMenuKeyboard() {
    return Markup.inlineKeyboard([
        [
            { text: '➕ Add Sender',    callback_data: 'sender_add',    style: 'success' },
            { text: '🗑️ Del Sender',   callback_data: 'sender_del',    style: 'danger'  }
        ],
        [
            { text: '📋 List Sender',   callback_data: 'sender_list',   style: 'primary' },
            { text: '📊 Status Sender', callback_data: 'sender_status', style: 'primary' }
        ],
        [{ text: '❌ Close', callback_data: 'sender_close', style: 'danger' }]
    ]);
}

function buildSenderBackKeyboard() {
    return Markup.inlineKeyboard([
        [{ text: '🔄 Back', callback_data: 'sender_back', style: 'primary' }]
    ]);
}


// ═════════════════════════════════════
//  MIDDLEWARE — Wajib Join (bypass Owner, /start, check_join)
// ═════════════════════════════════════

bot.use(async function (ctx, next) {
    if (!ctx.from) return next();

    const chatType = ctx.chat?.type;
    if (chatType === 'group' || chatType === 'supergroup') {
        const isCommand = ctx.message?.text?.startsWith('/');
        if (!isCommand) return;
        return next();
    }

    if (isOwner(ctx.from.id)) return next();

    if (isMaintenanceOn()) {
        const isCheckMaintenance = ctx.callbackQuery?.data === 'check_maintenance';
        if (!isCheckMaintenance) {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('🔧 Bot sedang maintenance! Mohon tunggu.', { show_alert: true });
            } else {
                await ctx.reply(
`<blockquote><b>🔧 𝗕𝗼𝘁 𝗦𝗲𝗱𝗮𝗻𝗴 𝗠𝗮𝗶𝗻𝘁𝗲𝗻𝗮𝗻𝗰𝗲!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🛠️ Status : Maintenance Mode ON
📌 Info   : Bot sedang dalam perbaikan sementara.
             Semua fitur dinonaktifkan untuk sementara.
━━━━━━━━━━━━━━━━

⚠️ Mohon tunggu hingga maintenance selesai.</b>`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [{ text: '🔄 Cek Status', callback_data: 'check_maintenance', style: 'primary' }]
                        ])
                    }
                );
            }
            return;
        }
    }

    recordUser(ctx.from);

    const isStartCommand = ctx.message?.text?.startsWith('/start');
    const isCheckJoin    = ctx.callbackQuery?.data === 'check_join';
    if (isStartCommand || isCheckJoin) return next();

    const notJoined = await getNotJoinedChats(ctx.from.id);
    if (notJoined.length > 0) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('⚠️ Kamu belum join semua channel/group!', { show_alert: true });
        }
        return sendJoinPrompt(ctx, notJoined);
    }

    return next();
});


// ═════════════════════════════════════
//  COMMAND — /start
// ═════════════════════════════════════

bot.start(async function (ctx) {
    logCommand(ctx, '/start');
    await sendStartMessage(ctx);
});


// ═════════════════════════════════════
//  COMMAND — /sender  (Semua User)
// ═════════════════════════════════════

bot.command('sender', async function (ctx) {
    logCommand(ctx, '/sender');
    userStates.delete(ctx.from.id);

    await ctx.reply(buildSenderMenuText(ctx), {
        parse_mode: 'HTML',
        ...buildSenderMenuKeyboard()
    });
});


// ═════════════════════════════════════
//  COMMAND — /fix  (Semua User — butuh sender pribadi)
// ═════════════════════════════════════

bot.command('fix', async function (ctx) {
    logCommand(ctx, `/fix ${ctx.message.text.split(' ').slice(1).join(' ')}`);

    const mySenders = getUserSenders(ctx.from.id);
    if (mySenders.length === 0) {
        return ctx.reply(
`<blockquote><b>⚠️ 𝗦𝗲𝗻𝗱𝗲𝗿 𝗕𝗲𝗹𝘂𝗺 𝗗𝗶𝘀𝗲𝘁!</b></blockquote>
<b>Kamu belum menambahkan email sender pribadi.

━━━━━━━━━━━━━━━━
📌 Cara menambahkan sender:
Gunakan perintah /sender lalu pilih ➕ Add Sender

Format: email@gmail.com:apppassword
━━━━━━━━━━━━━━━━

⚠️ Pastikan App Password sudah diaktifkan di akun Google kamu.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const phone = parsePhone(ctx.message.text.split(/\s+/)[1]);

    if (!phone) {
        return ctx.reply(
`<blockquote><b>⚠️ 𝗡𝗼𝗺𝗼𝗿 𝗧𝗶𝗱𝗮𝗸 𝗩𝗮𝗹𝗶𝗱!</b></blockquote>
<b>Sertakan nomor WhatsApp dalam format internasional yang benar.

📌 Format: /fix +628123456789
📝 Contoh: /fix +6281234567890</b>`,
            { parse_mode: 'HTML' }
        );
    }

    await ctx.reply(
`<blockquote><b>📌 𝗛𝗮𝗻𝗱𝗹𝗲 𝗙𝗶𝘅 𝗡𝘂𝗺𝗯𝗲𝗿</b></blockquote>
<b>🎯 Target: ${phone}

Pilih bahasa untuk surat banding yang akan dikirim ke tim WhatsApp:</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [
                    { text: APPEAL_LANGUAGES.EN.btn, callback_data: `fix_en_${phone}`, style: 'primary' }
                ],
                [
                    { text: APPEAL_LANGUAGES.ES.btn, callback_data: `fix_es_${phone}`, style: 'primary' },
                    { text: APPEAL_LANGUAGES.PT.btn, callback_data: `fix_pt_${phone}`, style: 'primary' }
                ],
                [
                    { text: APPEAL_LANGUAGES.AR.btn, callback_data: `fix_ar_${phone}`, style: 'primary' },
                    { text: APPEAL_LANGUAGES.DE.btn, callback_data: `fix_de_${phone}`, style: 'primary' }
                ],
                [
                    { text: '❌ Batal', callback_data: 'fix_cancel', style: 'danger' }
                ]
            ])
        }
    );
});


// ═════════════════════════════════════
//  COMMAND — /history  (Semua User)
// ═════════════════════════════════════

bot.command('history', async function (ctx) {
    logCommand(ctx, '/history');

    const records = getUserHistory(ctx.from.id);

    if (records.length === 0) {
        return ctx.reply(
`<blockquote><b>📜 𝗥𝗶𝘄𝗮𝘆𝗮𝘁 𝗕𝗮𝗻𝗱𝗶𝗻𝗴</b></blockquote>
<b>Kamu belum pernah mengirim banding.
Gunakan /fix &lt;nomor&gt; untuk mulai.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const last5   = records.slice(-5).reverse();
    let listText  = `<blockquote><b>📜 𝗥𝗶𝘄𝗮𝘆𝗮𝘁 𝗕𝗮𝗻𝗱𝗶𝗻𝗴</b></blockquote>\n<b>`;
    listText     += `5 Banding Terakhir Kamu:\n━━━━━━━━━━━━━━━━\n`;

    last5.forEach(function (h, i) {
        const date = new Date(h.timestamp).toLocaleString('id-ID');
        listText  += `\n${i + 1}. 📱 ${h.phone}\n`;
        listText  += `    🌐 Bahasa: ${h.lang}\n`;
        listText  += `    📄 Versi: ${h.version === 2 ? '2 — Laporan Registrasi' : '1 — Banding Akses'}\n`;
        listText  += `    📨 Tujuan: ${h.target}\n`;
        listText  += `    📅 Waktu: ${date}\n`;
    });

    listText += `\n━━━━━━━━━━━━━━━━\n`;
    listText += `Total banding kamu: ${records.length} kali</b>`;

    await ctx.reply(listText, { parse_mode: 'HTML' });
});


// ═════════════════════════════════════
//  COMMAND — /leaderboard  (Semua User — Kategori: Connect)
// ═════════════════════════════════════

bot.command('leaderboard', async function (ctx) {
    logCommand(ctx, '/leaderboard');

    const board = buildLeaderboard();

    if (board.length === 0) {
        return ctx.reply(
`<blockquote><b>🏆 𝗟𝗲𝗮𝗱𝗲𝗿𝗯𝗼𝗮𝗿𝗱 𝗕𝗮𝗻𝗱𝗶𝗻𝗴</b></blockquote>
<b>Belum ada data penggunaan fix.
Jadilah yang pertama! Gunakan /fix &lt;nomor&gt; sekarang.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const totalFix   = board.reduce((s, e) => s + e.fixCount, 0);
    const totalUsers = Object.keys(getUsers()).length;

    let text = `<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗟𝗘𝗔𝗗𝗘𝗥𝗕𝗢𝗔𝗥𝗗</b></blockquote>\n`;
    text    += `<b>🏆 Top ${board.length} Pengguna Terbanyak Fix\n`;
    text    += `━━━━━━━━━━━━━━━━\n\n`;

    for (const entry of board) {
        text += `${entry.rank} <a href="tg://user?id=${entry.uid}">${entry.name}</a>\n`;
        text += `    ├ Username  : ${entry.username}\n`;
        text += `    ├ Fix Terkirim : ${entry.fixCount}x\n`;
        text += `    └ Sender Email : ${entry.senderCount} email\n\n`;
    }

    text += `━━━━━━━━━━━━━━━━\n`;
    text += `📊 Total Fix Semua Pengguna: ${totalFix}x\n`;
    text += `👥 Total Pengguna Terdaftar : ${totalUsers} orang</b>`;

    await ctx.reply(text, { parse_mode: 'HTML' });
});


// ═════════════════════════════════════
//  COMMAND — /backup  (Owner Only)
// ═════════════════════════════════════

bot.command('backup', async function (ctx) {
    logCommand(ctx, '/backup');
    if (!isOwner(ctx.from.id)) {
        return ctx.reply(
`<blockquote><b>🚫 𝗔𝗸𝘀𝗲𝘀 𝗗𝗶𝘁𝗼𝗹𝗮𝗸!</b></blockquote>
<b>Perintah ini hanya bisa digunakan oleh Owner.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const waitMsg = await ctx.reply(
`<blockquote><b>⏳ 𝗠𝗲𝗺𝗯𝘂𝗮𝘁 𝗕𝗮𝗰𝗸𝘂𝗽...</b></blockquote>
<b>Sedang mengarsip file dan folder bot.
Mohon tunggu sebentar...</b>`,
        { parse_mode: 'HTML' }
    );

    const result = await runBackup(`manual by ${ctx.from.id}`);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    if (!result.ok) {
        return ctx.reply(
`<blockquote><b>❌ 𝗕𝗮𝗰𝗸𝘂𝗽 𝗚𝗮𝗴𝗮𝗹!</b></blockquote>
<b>Error: ${result.error}</b>`,
            { parse_mode: 'HTML' }
        );
    }

    await ctx.reply(
`<blockquote><b>✅ 𝗕𝗮𝗰𝗸𝘂𝗽 𝗕𝗲𝗿𝗵𝗮𝘀𝗶𝗹!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
📁 File: <code>${result.label}</code>
📬 Terkirim ke: ${result.successCount} owner
━━━━━━━━━━━━━━━━
File backup sudah dikirim ke semua Owner.</b>`,
        { parse_mode: 'HTML' }
    );
});


// ═════════════════════════════════════
//  COMMAND — /broadcast  (Owner Only)
// ═════════════════════════════════════

bot.command('broadcast', async function (ctx) {
    logCommand(ctx, '/broadcast');
    if (!isOwner(ctx.from.id)) {
        return ctx.reply(
`<blockquote><b>🚫 𝗔𝗸𝘀𝗲𝘀 𝗗𝗶𝘁𝗼𝗹𝗮𝗸!</b></blockquote>
<b>Perintah ini hanya bisa digunakan oleh Owner.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const text = ctx.message.text.split(' ').slice(1).join(' ');

    if (!text) {
        return ctx.reply(
`<blockquote><b>📢 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁</b></blockquote>
<b>Kirim pesan ke semua pengguna.

📌 Format:
/broadcast &lt;pesan&gt;

📝 Contoh:
/broadcast Selamat! Bot sudah diperbarui ke versi terbaru.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const allUsers = getUsers();
    const targets  = Object.keys(allUsers);

    if (targets.length === 0) {
        return ctx.reply(
`<blockquote><b>📢 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁</b></blockquote>
<b>Belum ada pengguna yang tercatat di database.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const waitMsg = await ctx.reply(
`<blockquote><b>⏳ 𝗠𝗲𝗻𝗴𝗶𝗿𝗶𝗺 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁...</b></blockquote>
<b>Mengirim pesan ke ${targets.length} pengguna.
Mohon tunggu sebentar...</b>`,
        { parse_mode: 'HTML' }
    );

    const broadcastText =
`<blockquote><b>📢 𝗣𝗲𝘀𝗮𝗻 𝗱𝗮𝗿𝗶 𝗔𝗱𝗺𝗶𝗻</b></blockquote>
<b>${text}</b>`;

    let sukses = 0, gagal = 0;

    for (const userId of targets) {
        try {
            await bot.telegram.sendMessage(userId, broadcastText, { parse_mode: 'HTML' });
            sukses++;
        } catch {
            gagal++;
        }
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    await ctx.reply(
`<blockquote><b>✅ 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁 𝗦𝗲𝗹𝗲𝘀𝗮𝗶!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
📊 Total Target: ${targets.length} pengguna
✅ Berhasil: ${sukses}
❌ Gagal/Blokir: ${gagal}
━━━━━━━━━━━━━━━━</b>`,
        { parse_mode: 'HTML' }
    );
});


// ═════════════════════════════════════
//  COMMAND — /maintenance  (Owner Only)
// ═════════════════════════════════════

bot.command('maintenance', async function (ctx) {
    logCommand(ctx, '/maintenance');
    if (!isOwner(ctx.from.id)) {
        return ctx.reply(
`<blockquote><b>🚫 𝗔𝗸𝘀𝗲𝘀 𝗗𝗶𝘁𝗼𝗹𝗮𝗸!</b></blockquote>
<b>Perintah ini hanya bisa digunakan oleh Owner.</b>`,
            { parse_mode: 'HTML' }
        );
    }

    const arg = ctx.message.text.split(' ')[1]?.toLowerCase();

    if (!arg || (arg !== 'on' && arg !== 'off')) {
        const status = isMaintenanceOn() ? '🔴 ON (Aktif)' : '🟢 OFF (Nonaktif)';
        return ctx.reply(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🔧 Status : ${status}
━━━━━━━━━━━━━━━━
📌 Format:
/maintenance on  — Aktifkan maintenance
/maintenance off — Nonaktifkan maintenance
━━━━━━━━━━━━━━━━</b>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        { text: '🔴 ON',  callback_data: 'maint_on',  style: 'danger'  },
                        { text: '🟢 OFF', callback_data: 'maint_off', style: 'success' }
                    ]
                ])
            }
        );
    }

    if (arg === 'on') {
        setMaintenance(true);
        return ctx.reply(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🔴 Status    : ON (Aktif)
🛠️ Tindakan : Maintenance diaktifkan
📌 Info      : Semua user tidak bisa menggunakan
               bot hingga maintenance dimatikan.
━━━━━━━━━━━━━━━━

✅ Berhasil mengaktifkan maintenance mode!</b>`,
            { parse_mode: 'HTML' }
        );
    }

    if (arg === 'off') {
        setMaintenance(false);
        return ctx.reply(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🟢 Status    : OFF (Nonaktif)
✅ Tindakan  : Maintenance dinonaktifkan
📌 Info      : Bot kembali normal, semua user
               bisa menggunakan bot kembali.
━━━━━━━━━━━━━━━━

✅ Berhasil menonaktifkan maintenance mode!</b>`,
            { parse_mode: 'HTML' }
        );
    }
});


// ═════════════════════════════════════
//  ACTION — All Menu
// ═════════════════════════════════════

bot.action('all_menu', async function (ctx) {
    logCommand(ctx, 'action: All Menu');
    await ctx.answerCbQuery();
    await smartEdit(ctx, buildAllMenuCaption(ctx), {
        parse_mode: 'HTML',
        ...buildAllMenuKeyboard(ctx)
    });
});


// ═════════════════════════════════════
//  ACTION — Kategori Fix & Banding
// ═════════════════════════════════════

bot.action('service_menu', async function (ctx) {
    logCommand(ctx, 'action: Category Service');
    await ctx.answerCbQuery();

    const statusLabel = getUserStatusLabel(ctx.from.id);
    const mention     = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

    await smartEdit(ctx,
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗔𝗣𝗣𝗘𝗔𝗟</b></blockquote>
<b>─ Hello, Friend!!
☇ Name: ${mention}
☇ UserID: <code>${ctx.from.id}</code>
☇ Status: ${statusLabel}
I Am A Telegram Bot Ready To Help You.</b>

<blockquote><b>( 🍁 ) 𝗦𝗲𝗿𝘃𝗶𝗰𝗲 ― 𝗠𝗲𝗻𝘂</b></blockquote>
<b>• /fix ― Kirim banding ke tim WhatsApp
• /history ― Lihat riwayat banding kamu</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🔄 Back', callback_data: 'back_all_menu', style: 'primary' }]
            ])
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Kategori Sender (Menu shortcut dari All Menu)
// ═════════════════════════════════════

bot.action('connect_menu', async function (ctx) {
    logCommand(ctx, 'action: Category Connect');
    await ctx.answerCbQuery();

    const mySenders  = getUserSenders(ctx.from.id);
    const statusLabel = getUserStatusLabel(ctx.from.id);
    const mention    = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

    await smartEdit(ctx,
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗖𝗢𝗡𝗡𝗘𝗖𝗧</b></blockquote>
<b>─ Hello, Friend!!
☇ Name: ${mention}
☇ UserID: <code>${ctx.from.id}</code>
☇ Status: ${statusLabel}
I Am A Telegram Bot Ready To Help You.</b>

<blockquote><b>( 🍁 ) 𝗖𝗼𝗻𝗻𝗲𝗰𝘁 ― 𝗠𝗲𝗻𝘂</b></blockquote>
<b>• /sender ― Kelola sender email kamu
• /leaderboard ― Lihat top 10 pengguna terbanyak fix</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🔄 Back', callback_data: 'back_all_menu', style: 'primary' }]
            ])
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Kategori Owner (Owner Only)
// ═════════════════════════════════════

bot.action('manage_menu', async function (ctx) {
    logCommand(ctx, 'action: Category Owner');
    if (!isOwner(ctx.from.id)) {
        return ctx.answerCbQuery('🚫 Akses ditolak!', { show_alert: true });
    }

    await ctx.answerCbQuery();

    const statusLabel = getUserStatusLabel(ctx.from.id);
    const mention     = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

    await smartEdit(ctx,
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗔𝗣𝗣𝗘𝗔𝗟</b></blockquote>
<b>─ Hello, Friend!!
☇ Name: ${mention}
☇ UserID: <code>${ctx.from.id}</code>
☇ Status: ${statusLabel}
I Am A Telegram Bot Ready To Help You.</b>

<blockquote><b>( 🍁 ) 𝗠𝗮𝗻𝗮𝗴𝗲 ― 𝗠𝗲𝗻𝘂</b></blockquote>
<b>• /broadcast — Kirim pesan ke semua pengguna
• /backup — Trigger backup manual sekarang
• /maintenance on/off — Aktifkan/nonaktifkan maintenance mode</b>

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🔄 Back', callback_data: 'back_all_menu', style: 'primary' }]
            ])
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Navigasi: Kembali ke All Menu
// ═════════════════════════════════════

bot.action('back_all_menu', async function (ctx) {
    logCommand(ctx, 'action: Back to All Menu');
    await ctx.answerCbQuery();
    await smartEdit(ctx, buildAllMenuCaption(ctx), {
        parse_mode: 'HTML',
        ...buildAllMenuKeyboard(ctx)
    });
});


// ═════════════════════════════════════
//  ACTION — Navigasi: Kembali ke Start
// ═════════════════════════════════════

bot.action('back_start', async function (ctx) {
    logCommand(ctx, 'action: Back to Start');
    await ctx.answerCbQuery();
    await editToStartMessage(ctx);
});


// ═════════════════════════════════════
//  ACTION — Maintenance Toggle (Owner Only)
// ═════════════════════════════════════

bot.action('maint_on', async function (ctx) {
    logCommand(ctx, 'action: Maintenance ON');
    if (!isOwner(ctx.from.id)) {
        return ctx.answerCbQuery('🚫 Akses ditolak!', { show_alert: true });
    }
    await ctx.answerCbQuery();
    setMaintenance(true);
    await ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🔴 Status    : ON (Aktif)
🛠️ Tindakan : Maintenance diaktifkan
📌 Info      : Semua user tidak bisa menggunakan
               bot hingga maintenance dimatikan.
━━━━━━━━━━━━━━━━

✅ Berhasil mengaktifkan maintenance mode!</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🟢 Matikan Maintenance', callback_data: 'maint_off', style: 'success' }]
            ])
        }
    );
});

bot.action('maint_off', async function (ctx) {
    logCommand(ctx, 'action: Maintenance OFF');
    if (!isOwner(ctx.from.id)) {
        return ctx.answerCbQuery('🚫 Akses ditolak!', { show_alert: true });
    }
    await ctx.answerCbQuery();
    setMaintenance(false);
    await ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗠𝗔𝗜𝗡𝗧𝗘𝗡𝗔𝗡𝗖𝗘</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🟢 Status    : OFF (Nonaktif)
✅ Tindakan  : Maintenance dinonaktifkan
📌 Info      : Bot kembali normal, semua user
               bisa menggunakan bot kembali.
━━━━━━━━━━━━━━━━

✅ Berhasil menonaktifkan maintenance mode!</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🔴 Aktifkan Maintenance', callback_data: 'maint_on', style: 'danger' }]
            ])
        }
    );
});

bot.action('check_maintenance', async function (ctx) {
    logCommand(ctx, 'action: Check Maintenance');
    await ctx.answerCbQuery();
    const isOn   = isMaintenanceOn();
    const status = isOn ? '🔴 ON (Sedang Maintenance)' : '🟢 OFF (Bot Normal)';
    await ctx.editMessageText(
`<blockquote><b>🔧 𝗕𝗼𝘁 𝗦𝗲𝗱𝗮𝗻𝗴 𝗠𝗮𝗶𝗻𝘁𝗲𝗻𝗮𝗻𝗰𝗲!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
🛠️ Status : ${status}
━━━━━━━━━━━━━━━━

${isOn ? '⚠️ Mohon tunggu hingga maintenance selesai.' : '✅ Bot sudah kembali normal, silakan gunakan kembali.'}</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '🔄 Cek Ulang', callback_data: 'check_maintenance', style: 'primary' }]
            ])
        }
    );
});


// ═════════════════════════════════════
//  HELP — Data Halaman per Kategori
// ═════════════════════════════════════

const HELP_PAGES = [
    {
        page:  1,
        total: 3,
        title: '( 🍁 ) 𝗛𝗲𝗹𝗽 ― 𝗖𝗼𝗻𝗻𝗲𝗰𝘁',
        badge: '🔗 Kategori: Connect',
        body:
`<b>Kelola koneksi email sender dan pantau aktivitas pengguna.

━━━━━━━━━━━━━━━━
📌 /sender
Buka menu kelola email sender pribadimu.

  ➕ Add Sender
  Tambahkan email Gmail + App Password.
  Format: <code>email@gmail.com:apppassword</code>
  Bisa sekaligus banyak, pisah koma:
  <code>email1:pass1,email2:pass2</code>

  🗑️ Del Sender
  Hapus sender. Pilih lewat tombol bernomor.

  📋 List Sender
  Lihat semua sender (10 per halaman, email di-mask).

  📊 Status Sender
  Cek koneksi SMTP tiap sender secara real-time.
━━━━━━━━━━━━━━━━
📌 /leaderboard
Lihat top 10 pengguna paling banyak kirim fix.
Menampilkan nama, jumlah fix, dan jumlah sender.
━━━━━━━━━━━━━━━━

⚠️ Gunakan App Password, bukan password biasa.
Aktifkan di: myaccount.google.com → Keamanan → App Passwords.</b>`
    },
    {
        page:  2,
        total: 3,
        title: '( 🍁 ) 𝗛𝗲𝗹𝗽 ― 𝗦𝗲𝗿𝘃𝗶𝗰𝗲',
        badge: '🔧 Kategori: Service',
        body:
`<b>Fitur utama untuk mengirim surat banding ke tim WhatsApp.

━━━━━━━━━━━━━━━━
📌 /fix &lt;nomor&gt;
Kirim surat banding ke email resmi WhatsApp.
Nomor harus format internasional.

  📝 Contoh: /fix +6281234567890

  ⚙️ Alur:
  1️⃣ Ketik /fix + nomor target
  2️⃣ Pilih bahasa surat banding
  3️⃣ Bot memakai email tujuan WhatsApp yang dikonfigurasi
  4️⃣ Bot kirim otomatis via sender Gmail kamu
━━━━━━━━━━━━━━━━
📌 /history
Lihat 5 riwayat banding terakhir kamu.
Mencakup nomor, bahasa, tujuan, dan waktu.
━━━━━━━━━━━━━━━━
🌐 Bahasa: 🇪🇸 Español · 🇵🇹 Português · 🇸🇦 عربية · 🇩🇪 Deutsch

⚠️ Harus punya sender aktif sebelum pakai /fix.</b>`
    },
    {
        page:  3,
        total: 3,
        title: '( 🍁 ) 𝗛𝗲𝗹𝗽 ― 𝗠𝗮𝗻𝗮𝗴𝗲',
        badge: '⚙️ Kategori: Manage  [ Owner Only ]',
        ownerOnly: true,
        body:
`<b>Panel kontrol eksklusif untuk Owner bot.

━━━━━━━━━━━━━━━━
📌 /broadcast &lt;pesan&gt;
Kirim pesan ke seluruh pengguna terdaftar.
Pesan dikirim satu per satu ke tiap user ID.

  📝 Contoh: /broadcast Halo semua!
━━━━━━━━━━━━━━━━
📌 /backup
Trigger backup manual database sekarang.
File ZIP dikirim langsung ke DM owner.

  📦 Isi backup:
  • XyneraDatabase/ — history &amp; users
  • XyneraSender/  — data sender terenkripsi
  • XyneraMedia/   — file media bot
━━━━━━━━━━━━━━━━
📌 /maintenance on/off
Aktifkan atau nonaktifkan mode maintenance.
Saat aktif, semua user tidak bisa pakai bot.

  📝 Contoh:
  /maintenance on  — Aktifkan maintenance
  /maintenance off — Nonaktifkan maintenance
━━━━━━━━━━━━━━━━

🔐 Halaman ini hanya bisa diakses oleh Owner.</b>`
    }
];

function buildHelpText(pageData) {
    return (
`<blockquote><b>${pageData.title}</b></blockquote>
<blockquote><b>${pageData.badge}</b></blockquote>
${pageData.body}

<blockquote><b>( 🍁 ) 𝗫𝘆𝗻𝗲𝗿𝗮 𝗔𝗽𝗽𝗲𝗮𝗹 ― 𝗕𝗼𝘁𝘇!.</b></blockquote>`
    );
}

function buildHelpKeyboard(page, total) {
    const navRow = [];

    if (page > 1) {
        navRow.push({ text: '⬅️ Prev', callback_data: `help_p${page - 1}`, style: 'primary' });
    }

    navRow.push({ text: `📄 ${page} / ${total}`, callback_data: 'help_noop', style: 'primary' });

    if (page < total) {
        navRow.push({ text: 'Next ➡️', callback_data: `help_p${page + 1}`, style: 'primary' });
    }

    return Markup.inlineKeyboard([
        navRow,
        [{ text: '🏠 Start Menu', callback_data: 'back_start', style: 'primary' }]
    ]);
}


// ═════════════════════════════════════
//  ACTION — Help Pages
// ═════════════════════════════════════

HELP_PAGES.forEach(function (pageData) {
    bot.action(`help_p${pageData.page}`, async function (ctx) {
        logCommand(ctx, `action: Help Page ${pageData.page}`);
        await ctx.answerCbQuery();
        await smartEdit(ctx, buildHelpText(pageData), {
            parse_mode: 'HTML',
            ...buildHelpKeyboard(pageData.page, pageData.total)
        });
    });
});

bot.action('help_noop', async function (ctx) {
    await ctx.answerCbQuery();
});


// ═════════════════════════════════════
//  ACTION — Sender Menu (via tombol Back dari sub-menu)
// ═════════════════════════════════════

bot.action('sender_back', async function (ctx) {
    logCommand(ctx, 'action: Sender Back');
    await ctx.answerCbQuery();
    userStates.delete(ctx.from.id);

    await ctx.editMessageText(buildSenderMenuText(ctx), {
        parse_mode: 'HTML',
        ...buildSenderMenuKeyboard()
    });
});


// ═════════════════════════════════════
//  ACTION — Sender: Add Sender
// ═════════════════════════════════════

bot.action('sender_add', async function (ctx) {
    logCommand(ctx, 'action: Sender Add');
    await ctx.answerCbQuery();

    const sentMsg = await ctx.reply(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗔𝗗𝗗 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>Tambahkan email sender pribadi kamu.

━━━━━━━━━━━━━━━━
📌 Format pengiriman:
<code>email@gmail.com:apppassword</code>

Bisa sekaligus banyak, pisahkan dengan koma:
<code>email1@gmail.com:pass1,email2@gmail.com:pass2</code>
━━━━━━━━━━━━━━━━

⚠️ Pastikan App Password (bukan password biasa) sudah diaktifkan di akun Google kamu.

Ketik dan kirim format di atas sekarang:</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [{ text: '❌ Batal', callback_data: 'sender_add_cancel', style: 'danger' }]
            ])
        }
    );

    userStates.set(ctx.from.id, {
        action:       'awaiting_add_sender',
        promptMsgId:  sentMsg.message_id,
        promptChatId: sentMsg.chat.id
    });
});


// ═════════════════════════════════════
//  ACTION — Sender: Cancel Add Sender
// ═════════════════════════════════════

bot.action('sender_add_cancel', async function (ctx) {
    logCommand(ctx, 'action: Sender Add Cancel');
    await ctx.answerCbQuery('Penambahan sender dibatalkan.');
    userStates.delete(ctx.from.id);
    await ctx.deleteMessage().catch(() => {});
});


// ═════════════════════════════════════
//  ACTION — Sender: Del Sender
// ═════════════════════════════════════

bot.action('sender_del', async function (ctx) {
    logCommand(ctx, 'action: Sender Del');
    await ctx.answerCbQuery();

    const uid      = ctx.from.id;
    const senders  = getUserSenders(uid);
    const mention  = `<a href="tg://user?id=${uid}">${ctx.from.first_name}</a>`;
    const fixCount = getUserHistory(String(uid)).length;

    if (senders.length === 0) {
        return ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗗𝗘𝗟 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>⚠️ Kamu belum memiliki sender yang terdaftar.

Gunakan ➕ Add Sender untuk menambahkan sender terlebih dahulu.</b>`,
            { parse_mode: 'HTML', ...buildSenderBackKeyboard() }
        );
    }

    const buttons = senders.map(function (s, i) {
        return [{ text: `🗑️ #${i + 1} — ${maskEmail(s.user)}`, callback_data: `sdel_${i}`, style: 'danger' }];
    });
    buttons.push([{ text: '🔄 Back', callback_data: 'sender_back', style: 'primary' }]);

    await ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗗𝗘𝗟 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>👤 ${mention}
━━━━━━━━━━━━━━━━
🔧 Total Fix Dikirim : ${fixCount}x
📦 Total Sender      : ${senders.length}
━━━━━━━━━━━━━━━━
🗑️ Tap sender di bawah untuk menghapusnya:
⚠️ Penghapusan tidak bisa dibatalkan!</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Sender: Delete by Index
// ═════════════════════════════════════

bot.action(/^sdel_(\d+)$/, async function (ctx) {
    const idx     = parseInt(ctx.match[1]);
    const senders = getUserSenders(ctx.from.id);

    if (idx < 0 || idx >= senders.length) {
        return ctx.answerCbQuery('⚠️ Sender tidak ditemukan.', { show_alert: true });
    }

    const deleted = senders[idx];
    senders.splice(idx, 1);
    saveUserSenders(ctx.from.id, senders);
    stopMonitorForSender(ctx.from.id, deleted.user);

    logCommand(ctx, `action: Sender Del — ${deleted.user}`);
    await ctx.answerCbQuery(`✅ ${maskEmail(deleted.user)} dihapus.`);

    await ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗗𝗘𝗟 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>🗑️ Sender berhasil dihapus!

━━━━━━━━━━━━━━━━
📧 Email: ${maskEmail(deleted.user)}
📦 Sisa sender: ${senders.length}
━━━━━━━━━━━━━━━━</b>`,
        {
            parse_mode: 'HTML',
            ...buildSenderBackKeyboard()
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Sender: List Sender
// ═════════════════════════════════════

// ─── List Sender helpers ────────────────────────────────────────────────────

const LIST_PER_PAGE = 10;

function buildListPageText(uid, page) {
    const senders   = getUserSenders(uid);
    const rotIdx    = (readUserData(uid).rotIdx || 0) % (senders.length || 1);
    const totalPage = Math.ceil(senders.length / LIST_PER_PAGE);
    const start     = (page - 1) * LIST_PER_PAGE;
    const slice     = senders.slice(start, start + LIST_PER_PAGE);

    let text = `<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗟𝗜𝗦𝗧 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>\n<b>`;
    text += `📦 ${senders.length} Sender  |  Hal. ${page} / ${totalPage}\n`;
    text += `━━━━━━━━━━━━━━━━\n\n`;

    slice.forEach(function (s, j) {
        const realIdx = start + j;
        const tag     = realIdx === rotIdx ? ' ◀' : '';
        text += `${realIdx + 1}. 📧 ${maskEmail(s.user)}${tag}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━\n`;
    text += `🔄 ◀ = giliran berikutnya</b>`;
    return text;
}

function buildListPageKeyboard(uid, page) {
    const senders   = getUserSenders(uid);
    const totalPage = Math.ceil(senders.length / LIST_PER_PAGE);
    const nav = [];

    if (page > 1)          nav.push({ text: '⬅️ Prev', callback_data: `slist_p${page - 1}`, style: 'primary' });
    if (page < totalPage)  nav.push({ text: 'Next ➡️', callback_data: `slist_p${page + 1}`, style: 'primary' });

    const rows = [];
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🔄 Back', callback_data: 'sender_back', style: 'primary' }]);
    return Markup.inlineKeyboard(rows);
}

bot.action('sender_list', async function (ctx) {
    logCommand(ctx, 'action: Sender List');
    await ctx.answerCbQuery();

    const uid     = ctx.from.id;
    const senders = getUserSenders(uid);

    if (senders.length === 0) {
        return ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗟𝗜𝗦𝗧 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>⚠️ Kamu belum memiliki sender yang terdaftar.

Gunakan ➕ Add Sender untuk menambahkan sender baru.</b>`,
            { parse_mode: 'HTML', ...buildSenderBackKeyboard() }
        );
    }

    await ctx.editMessageText(buildListPageText(uid, 1), {
        parse_mode: 'HTML',
        ...buildListPageKeyboard(uid, 1)
    });
});

bot.action(/^slist_p(\d+)$/, async function (ctx) {
    const page = parseInt(ctx.match[1]);
    const uid  = ctx.from.id;
    await ctx.answerCbQuery();
    await ctx.editMessageText(buildListPageText(uid, page), {
        parse_mode: 'HTML',
        ...buildListPageKeyboard(uid, page)
    });
});

const STATUS_PER_PAGE  = 10;
const statusCache      = new Map();   // userId → { results: [], activeCount, failCount, total, ts }

function buildStatusPageText(uid, page) {
    const cache     = statusCache.get(uid);
    const results   = cache.results;
    const totalPage = Math.ceil(results.length / STATUS_PER_PAGE);
    const start     = (page - 1) * STATUS_PER_PAGE;
    const slice     = results.slice(start, start + STATUS_PER_PAGE);

    let lines = '';
    slice.forEach(function (r) {
        lines += `${r.ok ? '✅' : '❌'} ${r.email}\n`;
    });

    let text = `<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗦𝗧𝗔𝗧𝗨𝗦 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>\n<b>`;
    text += `📦 ${results.length} Sender  |  Hal. ${page} / ${totalPage}\n`;
    text += `━━━━━━━━━━━━━━━━\n\n`;
    text += lines;
    text += `\n━━━━━━━━━━━━━━━━\n`;
    text += `✅ Aktif: ${cache.activeCount}  ❌ Gagal: ${cache.failCount}  📦 Total: ${cache.total}</b>`;
    return text;
}

function buildStatusPageKeyboard(uid, page) {
    const cache     = statusCache.get(uid);
    const totalPage = Math.ceil(cache.results.length / STATUS_PER_PAGE);
    const nav = [];

    if (page > 1)          nav.push({ text: '◀ Prev', callback_data: `sstatus_p${page - 1}`, style: 'primary' });
    if (page < totalPage)  nav.push({ text: 'Next ▶', callback_data: `sstatus_p${page + 1}`, style: 'primary' });

    const rows = [];
    if (nav.length) rows.push(nav);
    rows.push([{ text: '🔄 Back', callback_data: 'sender_back', style: 'primary' }]);
    return Markup.inlineKeyboard(rows);
}

// ═════════════════════════════════════
//  ACTION — Sender: Status Sender
// ═════════════════════════════════════

bot.action('sender_status', async function (ctx) {
    logCommand(ctx, 'action: Sender Status');
    await ctx.answerCbQuery();

    const uid     = ctx.from.id;
    const senders = getUserSenders(uid);

    if (senders.length === 0) {
        return ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗦𝗧𝗔𝗧𝗨𝗦 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>⚠️ Kamu belum memiliki sender yang terdaftar.

Gunakan Add Sender untuk menambahkan sender.</b>`,
            { parse_mode: 'HTML', ...buildSenderBackKeyboard() }
        );
    }

    await ctx.editMessageText(
`<blockquote><b>( 🍁 ) 𝗫𝗬𝗡𝗘𝗥𝗔 ― 𝗦𝗧𝗔𝗧𝗨𝗦 𝗦𝗘𝗡𝗗𝗘𝗥</b></blockquote>
<b>⏳ Mengecek ${senders.length} sender...</b>`,
        { parse_mode: 'HTML' }
    );

    const results     = [];
    let   activeCount = 0;
    let   failCount   = 0;

    for (const s of senders) {
        const check = await verifySender(s.user, s.pass);
        results.push({ email: maskEmail(s.user), ok: check.ok });
        if (check.ok) activeCount++; else failCount++;
    }

    statusCache.set(uid, { results, activeCount, failCount, total: senders.length });

    await ctx.editMessageText(buildStatusPageText(uid, 1), {
        parse_mode: 'HTML',
        ...buildStatusPageKeyboard(uid, 1)
    });
});

bot.action(/^sstatus_p(\d+)$/, async function (ctx) {
    const page = parseInt(ctx.match[1]);
    const uid  = ctx.from.id;
    await ctx.answerCbQuery();

    if (!statusCache.has(uid)) {
        return ctx.answerCbQuery('⚠️ Sesi habis, buka Status Sender lagi.', { show_alert: true });
    }

    await ctx.editMessageText(buildStatusPageText(uid, page), {
        parse_mode: 'HTML',
        ...buildStatusPageKeyboard(uid, page)
    });
});


// ═════════════════════════════════════
//  ACTION — Sender: Close
// ═════════════════════════════════════

bot.action('sender_close', async function (ctx) {
    logCommand(ctx, 'action: Sender Close');
    await ctx.answerCbQuery('Menu ditutup.');
    userStates.delete(ctx.from.id);
    await ctx.deleteMessage().catch(() => {});
});


// ═════════════════════════════════════
//  ACTION — Fix Step 2: Pilih Bahasa → Pilih Versi Laporan
// ═════════════════════════════════════

bot.action(/^fix_(en|es|pt|ar|de)_(.+)$/, async function (ctx) {
    const lang     = ctx.match[1].toUpperCase();
    const phone    = parsePhone(ctx.match[2]);

    if (!phone) {
        return ctx.answerCbQuery('⚠️ Nomor tidak valid.', { show_alert: true });
    }

    const waTarget = WA_TARGETS[0];
    const version  = 'v1';

    logCommand(ctx, `action: Fix — Bahasa ${lang} | Nomor ${phone} | Target ${waTarget.email} | Versi ${version}`);

    const selected = getNextSenderForUser(ctx.from.id);
    if (!selected) {
        return ctx.answerCbQuery('⚠️ Kamu belum punya sender! Gunakan /sender untuk menambahkan.', { show_alert: true });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(
`<blockquote><b>⏳ 𝗦𝗲𝗱𝗮𝗻𝗴 𝗠𝗲𝗺𝗽𝗿𝗼𝘀𝗲𝘀...</b></blockquote>
<b>🌐 Bahasa: ${lang}
📄 Versi: ${version === 'v2' ? '2 — Laporan Registrasi' : '1 — Banding Akses'}
📨 Tujuan: ${waTarget.email}
📧 Mengirim via: ${maskEmail(selected.user)}
🔄 Giliran Sender: ${selected.idx} / ${selected.total}

Mohon tunggu, sedang mengirim email banding ke WhatsApp...</b>`,
        { parse_mode: 'HTML' }
    );

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: selected.user, pass: selected.pass }
    });

    try {
        await transporter.sendMail({
            from:    selected.user,
            to:      waTarget.email,
            subject: CONFIGURED_APPEAL_SUBJECT[lang] || CONFIGURED_APPEAL_SUBJECT.EN,
            text:    buildConfiguredAppealBody(lang, phone)
        });

        addHistory({
            userId:    String(ctx.from.id),
            name:      ctx.from.first_name,
            phone:     phone,
            lang:      lang,
            version:   version === 'v2' ? 2 : 1,
            target:    waTarget.email,
            timestamp: Date.now()
        });

        const userSenders = getUserSenders(ctx.from.id);
        for (const s of userSenders) {
            const monKey = `${ctx.from.id}:${s.user}`;
            if (!activeMonitors.has(monKey)) {
                runMonitor(ctx.from.id, s);
            }
        }

        await ctx.editMessageText(
`<blockquote><b>✅ 𝗕𝗮𝗻𝗱𝗶𝗻𝗴 𝗕𝗲𝗿𝗵𝗮𝘀𝗶𝗹 𝗧𝗲𝗿𝗸𝗶𝗿𝗶𝗺!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
📱 Nomor Target: ${phone}
🌐 Bahasa Banding: ${lang}
📄 Versi Laporan: ${version === 'v2' ? '2 — Laporan Registrasi' : '1 — Banding Akses'}
📨 Tujuan: ${waTarget.email}
📧 Dikirim Via: ${maskEmail(selected.user)}
🔄 Giliran Sender: ${selected.idx} / ${selected.total}
━━━━━━━━━━━━━━━━

⏳ Proses review WhatsApp biasanya memakan waktu 1–3 hari kerja. Harap bersabar.</b>`,
            { parse_mode: 'HTML' }
        );

        const username = ctx.from.username ? `@${ctx.from.username}` : '—';

        bot.telegram.sendMessage(CHANNEL_LOG_ID,
`<blockquote><b>🔧 𝗟𝗼𝗴 𝗙𝗶𝘅 𝗕𝗮𝗻𝗱𝗶𝗻𝗴</b></blockquote>
<b>━━━━━━━━━━━━━━━━
👤 Nama: ${ctx.from.first_name}
🔖 Username: ${username}
🆔 User ID: <code>${ctx.from.id}</code>
━━━━━━━━━━━━━━━━
📱 Nomor Target: ${maskPhone(phone)}
🌐 Bahasa Banding: ${lang}
📄 Versi Laporan: ${version === 'v2' ? '2 — Laporan Registrasi' : '1 — Banding Akses'}
📨 Tujuan: ${maskEmail(waTarget.email)}
📧 Dikirim Via: ${maskEmail(selected.user)}
━━━━━━━━━━━━━━━━
📋 Log tercatat otomatis oleh sistem.
🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [{ text: '🤖 Open Bot', url: BOT_URL, style: 'success' }]
                ])
            }
        ).catch(() => {});

    } catch {
        await ctx.editMessageText(
`<blockquote><b>❌ 𝗣𝗲𝗻𝗴𝗶𝗿𝗶𝗺𝗮𝗻 𝗚𝗮𝗴𝗮𝗹!</b></blockquote>
<b>Sender ${maskEmail(selected.user)} mengalami masalah saat mengirim email.

💡 Coba cek status sender kamu via /sender → Status Sender.
Jika gagal, hapus dan tambahkan ulang App Password baru dari Google Account.</b>`,
            { parse_mode: 'HTML' }
        );
    }
});


// ═════════════════════════════════════
//  ACTION — Fix Back: Kembali ke Pilihan Bahasa
// ═════════════════════════════════════

bot.action(/^fix_back_(.+)$/, async function (ctx) {
    const phone = parsePhone(ctx.match[1]);

    if (!phone) {
        return ctx.answerCbQuery('⚠️ Nomor tidak valid.', { show_alert: true });
    }
    logCommand(ctx, `action: Fix Back — Nomor ${phone}`);
    await ctx.answerCbQuery();
    await ctx.editMessageText(
`<blockquote><b>📌 𝗛𝗮𝗻𝗱𝗹𝗲 𝗙𝗶𝘅 𝗡𝘂𝗺𝗯𝗲𝗿</b></blockquote>
<b>🎯 Target: ${phone}

Pilih bahasa untuk surat banding yang akan dikirim ke tim WhatsApp:</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [
                    { text: APPEAL_LANGUAGES.EN.btn, callback_data: `fix_en_${phone}`, style: 'primary' }
                ],
                [
                    { text: APPEAL_LANGUAGES.ES.btn, callback_data: `fix_es_${phone}`, style: 'primary' },
                    { text: APPEAL_LANGUAGES.PT.btn, callback_data: `fix_pt_${phone}`, style: 'primary' }
                ],
                [
                    { text: APPEAL_LANGUAGES.AR.btn, callback_data: `fix_ar_${phone}`, style: 'primary' },
                    { text: APPEAL_LANGUAGES.DE.btn, callback_data: `fix_de_${phone}`, style: 'primary' }
                ],
                [
                    { text: '❌ Batal', callback_data: 'fix_cancel', style: 'danger' }
                ]
            ])
        }
    );
});


// ═════════════════════════════════════
//  ACTION — Fix Cancel
// ═════════════════════════════════════

bot.action('fix_cancel', async function (ctx) {
    logCommand(ctx, 'action: Fix Cancel');
    await ctx.answerCbQuery('Proses fix dibatalkan.');
    await ctx.deleteMessage().catch(() => {});
});




// ═════════════════════════════════════
//  ACTION — Cek Ulang Join
// ═════════════════════════════════════

bot.action('check_join', async function (ctx) {
    logCommand(ctx, 'action: Check Join');
    await ctx.answerCbQuery();
    const notJoined = await getNotJoinedChats(ctx.from.id);

    if (notJoined.length === 0) {
        await ctx.editMessageText(
`<blockquote><b>✅ 𝗩𝗲𝗿𝗶𝗳𝗶𝗸𝗮𝘀𝗶 𝗕𝗲𝗿𝗵𝗮𝘀𝗶𝗹!</b></blockquote>
<b>Kamu sudah bergabung ke semua channel dan group yang diperlukan.

Silakan gunakan /start untuk memulai menggunakan bot.</b>`,
            { parse_mode: 'HTML' }
        );
    } else {
        const list = notJoined.map(c => `• ${c.label}`).join('\n');
        await ctx.editMessageText(
`<blockquote><b>❌ 𝗩𝗲𝗿𝗶𝗳𝗶𝗸𝗮𝘀𝗶 𝗚𝗮𝗴𝗮𝗹!</b></blockquote>
<b>Kamu masih belum bergabung ke semua yang diperlukan.

━━━━━━━━━━━━━━━━
📌 Belum Join:
${list}
━━━━━━━━━━━━━━━━

Join semua terlebih dahulu, lalu tekan Sudah Join, Cek Ulang lagi.</b>`,
            {
                parse_mode: 'HTML',
                ...buildJoinKeyboard(notJoined)
            }
        );
    }
});


// ═════════════════════════════════════
//  TEXT HANDLER — Tangkap input user untuk Add Sender
// ═════════════════════════════════════

bot.on('text', async function (ctx) {
    const state = userStates.get(ctx.from.id);
    if (!state || state.action !== 'awaiting_add_sender') return;

    const input = ctx.message.text.trim();
    // Abaikan jika itu command
    if (input.startsWith('/')) return;

    const { promptMsgId, promptChatId } = state;
    userStates.delete(ctx.from.id);

    const pairs = input.split(',');
    const existing = getUserSenders(ctx.from.id);
    const existingEmails = existing.map(s => s.user);

    // Edit pesan prompt Add Sender jadi tampilan mengecek SMTP
    await ctx.telegram.editMessageText(
        promptChatId,
        promptMsgId,
        null,
`<blockquote><b>🔍 𝗠𝗲𝗻𝗴𝗲𝗰𝗲𝗸 𝗦𝗠𝗧𝗣...</b></blockquote>
<b>Sedang memverifikasi koneksi SMTP untuk ${pairs.length} email.
Mohon tunggu sebentar...</b>`,
        { parse_mode: 'HTML' }
    ).catch(() => {});

    let added = 0, invalid = 0, duplicate = 0;
    let resultLines = '';
    const newSenders = [...existing];

    for (const pair of pairs) {
        const parts = pair.trim().split(':');
        const user  = parts[0];
        const pass  = parts.slice(1).join(':'); // app pass bisa mengandung titik dua

        if (!user || !pass) {
            invalid++;
            resultLines += `❌ Format salah — dilewati\n`;
            continue;
        }

        if (existingEmails.includes(user)) {
            duplicate++;
            resultLines += `⚠️ ${maskEmail(user)} — sudah ada, dilewati\n`;
            continue;
        }

        const check = await verifySender(user, pass);
        if (check.ok) {
            newSenders.push({ user, pass });
            existingEmails.push(user);
            added++;
            resultLines += `✅ ${maskEmail(user)} — valid\n`;
        } else {
            invalid++;
            resultLines += `❌ ${maskEmail(user)} — gagal (cek email & App Password)\n`;
        }
    }

    // Hapus pesan "Mengecek SMTP" setelah selesai
    await ctx.telegram.deleteMessage(promptChatId, promptMsgId).catch(() => {});

    if (added > 0) {
        saveUserSenders(ctx.from.id, newSenders);
        // Mulai monitor real-time untuk sender yang baru ditambahkan
        const prevLen = existing.length;
        for (let si = prevLen; si < newSenders.length; si++) {
            runMonitor(ctx.from.id, newSenders[si]);
        }
    }

    await ctx.reply(
`<blockquote><b>${added > 0 ? '✅' : '❌'} 𝗛𝗮𝘀𝗶𝗹 𝗔𝗱𝗱 𝗦𝗲𝗻𝗱𝗲𝗿</b></blockquote>
<b>━━━━━━━━━━━━━━━━
📋 Detail Verifikasi:
${resultLines}
━━━━━━━━━━━━━━━━
➕ Ditambahkan: ${added}
❌ Gagal/Format salah: ${invalid}
⚠️ Duplikat: ${duplicate}
📦 Total sender kamu: ${newSenders.length}
━━━━━━━━━━━━━━━━</b>`,
        { parse_mode: 'HTML' }
    );
});


// ═════════════════════════════════════
//  ACTION — Back ke Sender Menu (dari pesan text hasil add)
// ═════════════════════════════════════

bot.action('sender_back_msg', async function (ctx) {
    await ctx.answerCbQuery();
    userStates.delete(ctx.from.id);

    await ctx.editMessageText(buildSenderMenuText(ctx), {
        parse_mode: 'HTML',
        ...buildSenderMenuKeyboard()
    });
});


// ═════════════════════════════════════
//  INBOX MONITOR — Real-time IMAP IDLE
// ═════════════════════════════════════

// Map key: `${userId}:${email}` → { client, stopped }
const activeMonitors = new Map();
const monitorReconnects = new Map();

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyInbox(userId, senderEmail, msg) {
    try {
        const env     = msg.envelope || {};
        const from    = env.from?.[0];
        const fromAddress = String(from?.address || '').toLowerCase();
        const appealTargets = new Set(WA_TARGETS.map(target => target.email.toLowerCase()));
        // Email dari pengirim lain tetap dianggap sudah diproses. Dengan
        // begitu cursor tidak macet hanya karena email tersebut bukan balasan
        // dari alamat WhatsApp yang dipantau.
        if (!appealTargets.has(fromAddress)) return true;

        const fromStr = from
            ? `${from.name ? from.name + ' ' : ''}<${from.address}>`.trim()
            : '(tidak diketahui)';
        const subject = env.subject || '(tanpa subjek)';
        const date    = env.date
            ? new Date(env.date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
            : '—';

        const text =
`<blockquote><b>📬 𝗜𝗻𝗯𝗼𝘅 𝗕𝗮𝗿𝘂!</b></blockquote>
<b>━━━━━━━━━━━━━━━━
📧 Akun   : ${maskEmail(senderEmail)}
📨 Dari   : ${escHtml(fromStr)}
📋 Subjek : ${escHtml(subject)}
🕐 Waktu  : ${date}
━━━━━━━━━━━━━━━━</b>`;

        await bot.telegram.sendMessage(userId, text, { parse_mode: 'HTML' });
        logInfo(`Notif inbox → user ${userId}`, `Dari: ${fromStr} | Subj: ${subject}`);
        return true;
    } catch (e) {
        logError('notifyInbox error', e.message || '');
        return false;
    }
}

async function runMonitor(userId, sender, retryCount = 0) {
    const { user, pass } = sender;
    const key = `${userId}:${user}`;

    const pendingReconnect = monitorReconnects.get(key);
    if (pendingReconnect) {
        clearTimeout(pendingReconnect);
        monitorReconnects.delete(key);
    }

    // Jangan membuat koneksi kedua untuk sender yang sama.
    const prev = activeMonitors.get(key);
    if (prev) return;

    const entry = { client: null, stopped: false, fetching: false };
    activeMonitors.set(key, entry);

    const client = new ImapFlow({
        host   : 'imap.gmail.com',
        port   : 993,
        secure : true,
        auth   : { user, pass },
        logger : false,
        tls    : { rejectUnauthorized: false }
    });

    entry.client = client;

    try {
        await client.connect();
        retryCount = 0;

        const mailbox = await client.mailboxOpen('INBOX');
        const uidValidity = mailbox.uidValidity == null
            ? ''
            : String(mailbox.uidValidity);
        const mailboxNextUid = Number(mailbox.uidNext) || 1;
        const savedCursor = getInboxCursor(sender);

        let nextUid;
        const mailboxChanged = savedCursor &&
            savedCursor.uidValidity &&
            uidValidity &&
            savedCursor.uidValidity !== uidValidity;

        if (!savedCursor || mailboxChanged) {
            // Baseline wajib melewati seluruh inbox lama. Email baru yang
            // masuk setelah titik ini akan tertangkap oleh sync pertama.
            nextUid = mailboxNextUid;
            saveInboxCursor(userId, user, { uidValidity, nextUid });
            logSystem(
                `Baseline inbox: ${maskEmail(user)} — email lama dilewati (UID berikutnya ${nextUid})`
            );
        } else {
            nextUid = savedCursor.nextUid;
            logSystem(
                `Monitor lanjut: ${maskEmail(user)} (user ${userId}, UID ≥ ${nextUid})`
            );
        }

        async function syncInbox() {
            if (entry.stopped || entry.fetching) return;
            entry.fetching = true;
            try {
                const fetched = [];
                for await (const msg of client.fetch(
                    { uid: `${nextUid}:*` },
                    { uid: true, envelope: true, source: true }
                )) {
                    fetched.push(msg);
                }
                for (const msg of fetched) {
                    if (msg.uid < nextUid) continue;

                    const delivered = await notifyInbox(userId, user, msg);
                    if (!delivered) {
                        // Jangan memajukan cursor bila Telegram gagal. Pesan
                        // akan dicoba lagi pada reconnect/sync berikutnya.
                        break;
                    }

                    nextUid = msg.uid + 1;
                    saveInboxCursor(userId, user, { uidValidity, nextUid });
                }
            } catch (e) {
                logError(`Monitor fetch ${maskEmail(user)}`, e.message || '');
            } finally {
                entry.fetching = false;
            }
        }

        client.on('exists', syncInbox);

        // Menutup celah antara mailboxOpen() dan pemasangan listener. Jika
        // email baru masuk di celah itu, sync ini tetap menangkapnya; email
        // sebelum baseline tidak akan ikut karena nextUid sudah dipatok.
        await syncInbox();

        // idle() selesai saat server memutus IDLE (tiap ~30 menit) → loop ulang
        while (!entry.stopped) {
            try { await client.idle(); } catch { break; }
        }

    } catch (err) {
        logError(`Monitor ${maskEmail(user)} gagal`, err.message || '');
    }

    try { await client.logout(); } catch {}

    if (!entry.stopped) {
        if (activeMonitors.get(key) === entry) activeMonitors.delete(key);
        const delay = Math.min(600000, 30000 * Math.pow(2, Math.min(retryCount, 4)));
        logSystem(`Reconnect monitor ${maskEmail(user)} dalam ${Math.round(delay / 1000)}s`);
        const reconnect = setTimeout(() => {
            monitorReconnects.delete(key);
            runMonitor(userId, sender, retryCount + 1);
        }, delay);
        reconnect.unref?.();
        monitorReconnects.set(key, reconnect);
    }
}

function stopMonitorForSender(userId, email) {
    const key   = `${userId}:${email}`;
    const reconnect = monitorReconnects.get(key);
    if (reconnect) {
        clearTimeout(reconnect);
        monitorReconnects.delete(key);
    }
    const entry = activeMonitors.get(key);
    if (entry) {
        entry.stopped = true;
        Promise.resolve(entry.client?.logout()).catch(() => {});
        activeMonitors.delete(key);
        logSystem(`Monitor dihentikan: ${maskEmail(email)}`);
    }
}

function startAllMonitors() {
    if (!fs.existsSync(SENDERS_DIR)) return;
    const files = fs.readdirSync(SENDERS_DIR).filter(f => f.endsWith('.json'));
    let idx = 0;
    for (const file of files) {
        const userId = file.replace('.json', '');
        try {
            const senders = getUserSenders(userId);
            for (const sender of senders) {
                const i = idx++;
                setTimeout(() => runMonitor(userId, sender), 300 * i);
            }
        } catch {}
    }
    if (idx > 0) logSystem(`Inbox monitor dimulai untuk ${idx} sender.`);
}


// ═════════════════════════════════════
//  LAUNCH
// ═════════════════════════════════════

function startBot() {
    bot.launch().catch(err => {
        logError('Bot gagal start', err?.message || String(err));
        process.exitCode = 1;
    });
    logSystem('Bot Online — Xynera Appeal siap digunakan!');
    startAutoBackup();

    process.once('SIGINT',  () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    startAllMonitors();
}

logBanner(BOT_INFO);
startBot();