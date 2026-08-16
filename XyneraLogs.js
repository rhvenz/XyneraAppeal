// ═════════════════════════════════════
//              Xynera Appeal — WhatsApp Ban Recovery Bot
//                       Author: @Rhvenz
// ═════════════════════════════════════

// ═════════════════════════════════════
//  ANSI — Colors Code
// ═════════════════════════════════════
const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    italic:  '\x1b[3m',
    black:   '\x1b[30m',
    cyan:    '\x1b[96m',
    yellow:  '\x1b[93m',
    green:   '\x1b[92m',
    magenta: '\x1b[95m',
    white:   '\x1b[97m',
    blue:    '\x1b[94m',
    red:     '\x1b[91m',
    orange:  '\x1b[38;5;208m',
    gray:    '\x1b[90m',
    lime:    '\x1b[38;5;118m',
};

function clr(color, text) {
    return `${color}${text}${C.reset}`;
}


// ═════════════════════════════════════
//  HELPER — Functions
// ═════════════════════════════════════

function getTimeWIB() {
    return new Date().toLocaleString('id-ID', {
        timeZone:  'Asia/Jakarta',
        hour:      '2-digit',
        minute:    '2-digit',
        second:    '2-digit',
        hour12:    false
    }) + ' WIB';
}

function getDateTimeWIB() {
    return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
}

function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLen(str) {
    return stripAnsi(str).length;
}

function padRight(str, len) {
    const s    = String(str);
    const vLen = visibleLen(s);
    return vLen >= len ? s : s + ' '.repeat(len - vLen);
}

function padLeft(str, len) {
    const s    = String(str);
    const vLen = visibleLen(s);
    return vLen >= len ? s : ' '.repeat(len - vLen) + s;
}

function truncate(str, maxLen = 45) {
    const s = String(str || '');
    return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

function center(str, W) {
    const pad = Math.max(0, Math.floor((W - visibleLen(str)) / 2));
    return ' '.repeat(pad) + str;
}


// ═════════════════════════════════════
//  LOG — Startup Banner
// ═════════════════════════════════════

function logBanner(info) {
    const W     = 52;
    const termW = process.stdout.columns || 80;
    const LP    = ' '.repeat(Math.max(0, Math.floor((termW - W) / 2)));

    const SEP  = clr(C.cyan,  '━'.repeat(W));
    const THIN = clr(C.gray,  '─'.repeat(W));
    const node = process.version;
    const time = getDateTimeWIB();

    const botName   = (info && info.Name)       || 'Xynera \u2b38 Appeal';
    const botVer    = (info && info.Version)     || '2.0';
    const botTag    = (info && info.VersionTag)  || 'New Update';
    const botAuthor = (info && info.Author)      || '@Rhvenz';
    const botPlat   = (info && info.Platform)    || 'Telegram';
    const botLang   = (info && info.Language)    || 'JavaScript [ Node.js ]';
    const botFw     = (info && info.Framework)   || 'Telegraf \u26cc Nodemailer';

    // ── ASCII Art — JANGAN DIUBAH ─────────────────────────
    const art = [
      " _    _  _     _  _   _  ___    ___    _____ ",
      "( )  ( )( )   ( )( ) ( )(  _`\\ |  _`\\ (  _  )",
      "`\\`\\/'/'`\\`\\_/'/'| `\\| || (_(_)| (_) )| (_) |",
      "  >  <    `\\ /'  | , ` ||  _)_ | ,  / |  _  |",
      " /'/\\`\\    | |   | |`\\ || (_( )| |\\ \\ | | | |",
      "(_)  (_)   (_)   (_) (_)(____/'(_) (_)(_) (_)"
    ];

    // ── Info row builder ──────────────────────────────────
    function row(icon, label, value, valColor) {
        const ic  = clr(C.yellow, icon);
        const lbl = clr(C.gray,   padRight(label, 11));
        const col = valColor || C.white;
        const val = clr(col,      truncate(value, 28));
        console.log(`${LP}  ${ic}  ${lbl}  ${clr(C.gray, '│')}  ${val}`);
    }

    function rowDivider() {
        console.log(`${LP}  ${clr(C.gray, '·'.repeat(W - 4))}`);
    }

    process.stdout.write('\x1Bc');
    console.clear();
    console.log('');
    console.log(LP + SEP);
    art.forEach(line => console.log(LP + center(clr(C.yellow, line), W)));
    console.log(LP + SEP);

    // ── Judul & Sub ───────────────────────────────────────
    console.log(LP + center(clr(C.bold + C.magenta, `\u2193  ${botName.toUpperCase()}  \u2193  v${botVer}`), W));
    console.log(LP + center(clr(C.white,            `${botPlat} \u00b7 WhatsApp Ban Recovery Bot`), W));
    console.log(LP + center(clr(C.cyan,             `Made with \u2665 by ${botAuthor}`), W));
    console.log(LP + THIN);

    // ── Blok: Bot Identity ────────────────────────────────
    console.log(`${LP}  ${clr(C.bold + C.green, '\u25b8 BOT IDENTITY')}`);
    row('\u25cf', 'Bot Name',  botName);
    row('\u25cf', 'Version',   botVer,     C.lime);
    row('\u25cf', 'Mode',      'Public',   C.green);
    row('\u25cf', 'Developer', botAuthor,  C.cyan);
    row('\u25cf', 'Platform',  botPlat);

    rowDivider();

    // ── Blok: Tech Stack ──────────────────────────────────
    console.log(`${LP}  ${clr(C.bold + C.blue, '\u25b8 TECH STACK')}`);
    row('\u25a0', 'Framework', botFw);
    row('\u25a0', 'Language',  botLang);
    row('\u25a0', 'Runtime',   `Node.js ${node}`);
    row('\u25a0', 'Storage',   'Base64',   C.yellow);

    rowDivider();

    // ── Blok: Runtime Info ────────────────────────────────
    console.log(`${LP}  ${clr(C.bold + C.cyan, '\u25b8 RUNTIME')}`);
    row('\u25d9', 'Started',   time, C.orange);

    console.log(LP + SEP);
    console.log('');
}


// ═════════════════════════════════════
//  LOG — Command / Interaksi User
//  Style baru: box rounded ╭╰ dengan badge warna
// ═════════════════════════════════════

function logCommand(ctx, action) {
    const username = ctx.from?.username ? `@${ctx.from.username}` : '@NoUsername';
    const userId   = String(ctx.from?.id || '—');
    const time     = getTimeWIB();
    const W        = 50;

    const BADGE   = clr(C.bold + C.black + '\x1b[42m', ' CMD ');
    const topBar  = clr(C.green, '╭' + '─'.repeat(W - 1));
    const botBar  = clr(C.green, '╰' + '─'.repeat(W - 1));
    const midBar  = clr(C.green, '├' + '┄'.repeat(W - 1));
    const pipe    = clr(C.green, '│');

    function line(key, val, valColor) {
        const k   = clr(C.gray,          padRight(key, 8));
        const sep = clr(C.green,         ' → ');
        const v   = clr(valColor || C.white, truncate(String(val), 30));
        return `${pipe}  ${k}${sep}${v}`;
    }

    const titleLine = `${pipe}  ${BADGE}  ${clr(C.bold + C.white, 'USER ACTIVITY LOG')}`;

    console.log('');
    console.log(topBar);
    console.log(titleLine);
    console.log(midBar);
    console.log(line('User',   username, C.cyan));
    console.log(line('ID',     userId,   C.yellow));
    console.log(line('Time',   time,     C.gray));
    console.log(midBar);
    console.log(line('Action', action,   C.lime));
    console.log(botBar);
    console.log('');
}


// ═════════════════════════════════════
//  LOG — Proses Sistem (Backup, Bot Start, dll)
//  Style baru: panel compact dengan ikon & warna oranye
// ═════════════════════════════════════

function logSystem(action) {
    const time  = getTimeWIB();
    const W     = 50;

    const BADGE  = clr(C.bold + C.black + '\x1b[43m', ' SYS ');
    const topBar = clr(C.orange, '╭' + '─'.repeat(W - 1));
    const botBar = clr(C.orange, '╰' + '─'.repeat(W - 1));
    const midBar = clr(C.orange, '├' + '┄'.repeat(W - 1));
    const pipe   = clr(C.orange, '│');

    function line(key, val, valColor) {
        const k   = clr(C.gray,          padRight(key, 8));
        const sep = clr(C.orange,        ' ⟡ ');
        const v   = clr(valColor || C.white, truncate(String(val), 30));
        return `${pipe}  ${k}${sep}${v}`;
    }

    const titleLine = `${pipe}  ${BADGE}  ${clr(C.bold + C.white, 'SYSTEM PROCESS LOG')}`;

    console.log('');
    console.log(topBar);
    console.log(titleLine);
    console.log(midBar);
    console.log(line('Time',    time,   C.gray));
    console.log(midBar);
    console.log(line('Process', action, C.orange));
    console.log(botBar);
    console.log('');
}


// ═════════════════════════════════════
//  LOG — Info (Proses validasi, inisialisasi, dll)
// ═════════════════════════════════════

function logInfo(message) {
    const time  = getTimeWIB();
    const W     = 50;

    const BADGE  = clr(C.bold + C.black + '\x1b[46m', ' INF ');
    const topBar = clr(C.cyan, '╭' + '─'.repeat(W - 1));
    const botBar = clr(C.cyan, '╰' + '─'.repeat(W - 1));
    const midBar = clr(C.cyan, '├' + '┄'.repeat(W - 1));
    const pipe   = clr(C.cyan, '│');

    function line(key, val, valColor) {
        const k   = clr(C.gray,              padRight(key, 8));
        const sep = clr(C.cyan,              ' → ');
        const v   = clr(valColor || C.white, truncate(String(val), 30));
        return `${pipe}  ${k}${sep}${v}`;
    }

    console.log('');
    console.log(topBar);
    console.log(`${pipe}  ${BADGE}  ${clr(C.bold + C.white, 'INFO LOG')}`);
    console.log(midBar);
    console.log(line('Time',    time,    C.gray));
    console.log(midBar);
    console.log(line('Message', message, C.cyan));
    console.log(botBar);
    console.log('');
}


// ═════════════════════════════════════
//  LOG — Error (Token invalid, fetch gagal, dll)
// ═════════════════════════════════════

function logError(label, detail) {
    const time  = getTimeWIB();
    const W     = 50;

    const BADGE  = clr(C.bold + C.black + '\x1b[41m', ' ERR ');
    const topBar = clr(C.red, '╭' + '─'.repeat(W - 1));
    const botBar = clr(C.red, '╰' + '─'.repeat(W - 1));
    const midBar = clr(C.red, '├' + '┄'.repeat(W - 1));
    const pipe   = clr(C.red, '│');

    function line(key, val, valColor) {
        const k   = clr(C.gray,              padRight(key, 8));
        const sep = clr(C.red,               ' ✖ ');
        const v   = clr(valColor || C.white, truncate(String(val), 30));
        return `${pipe}  ${k}${sep}${v}`;
    }

    console.log('');
    console.log(topBar);
    console.log(`${pipe}  ${BADGE}  ${clr(C.bold + C.white, 'ERROR LOG')}`);
    console.log(midBar);
    console.log(line('Time',   time,   C.gray));
    console.log(midBar);
    console.log(line('Label',  label,  C.red));
    if (detail) console.log(line('Detail', detail, C.yellow));
    console.log(botBar);
    console.log('');
}


module.exports = { logBanner, logCommand, logSystem, logInfo, logError };