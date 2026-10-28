<?php
/**
 * 小金库 · 自建服务器同步接口（单文件，无需数据库）
 *
 * 接口约定：
 *   GET  /api.php                 → 拉取服务器上的数据
 *   POST /api.php                 → 推送本机数据到服务器
 *   OPTIONS /api.php              → CORS 预检
 *
 * 请求/响应均为 JSON。鉴权使用请求头 X-Sync-Token（不再接受 URL 查询参数传递令牌，
 * 避免令牌进入访问日志）。
 *
 * 响应格式：
 *   成功 200 {"ok":true,"version":12,"updatedAt":"2026-10-20T14:30:00","data":{...}}
 *   冲突 409 {"ok":false,"conflict":true,"version":13,"updatedAt":"...","data":{...}}
 *   异常 500 {"ok":false,"error":"..."}（写入失败、数据文件损坏等，绝不返回假成功）
 *
 * 部署：把本文件与下面的 .htaccess 一起放到站点中一个专用目录（如 /sync），
 * 数据文件建议放在站点根目录之外（脚本内 DATA_DIR 可自行调整）。
 */

// ===== 配置 =====
// 数据存放目录：**务必**放在 Web 根目录之外，防止被直接下载。
// 若无法放到站点外，则依赖同目录的 .htaccess 禁止直接访问 .json。
const DATA_DIR = __DIR__ . '/data';
const DATA_FILE = DATA_DIR . '/xiaojinku.json';
// 每日保留一份历史快照，最多保留 30 份（误操作可回滚）
const HISTORY_DIR = DATA_DIR . '/history';
const HISTORY_KEEP = 30;

// 允许的来源（CORS 白名单）。仅命中白名单时才回显 Access-Control-Allow-Origin。
// 如需新增访问域名，在此追加即可。
const ALLOWED_ORIGINS = [
    'https://xiaojinku.19950920.xyz',
    // 本地开发联调用（vite dev server）
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
];

// 设备本地配置字段：任何情况下都不允许落盘到服务器，也不允许下发给客户端。
// 即便旧版客户端上传了这些字段，服务端也会在写入前剔除（纵深防御）。
const DEVICE_SETTING_KEYS = [
    'appLockEnabled',
    'pinHash',
    'theme',
    'sync',
    'lastBackupAt',
    'dividendScanAt',
];

// ===== 通用：CORS + JSON =====
function sendCors() {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim($_SERVER['HTTP_ORIGIN'], '/') : '';
    header('Vary: Origin');
    if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Sync-Token');
        header('Access-Control-Max-Age: 86400');
        return;
    }
    // 非白名单来源：不回显任何 CORS 头（浏览器会直接拦截）
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Sync-Token');
    header('Access-Control-Max-Age: 86400');
}
function sendJson($obj, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit;
}

sendCors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// ===== 鉴权 =====
// 期望的令牌写在一个 token.txt 里（首行），避免把密钥硬编码进可被访问的目录。
// 首次使用请在 DATA_DIR 下新建 token.txt，内容为你自定义的令牌。
// 注意：已不再支持 ?token= 查询参数（令牌会进入访问日志），只用 X-Sync-Token 请求头。
$tokenFile = DATA_DIR . '/token.txt';
$expected = '';
if (is_file($tokenFile)) {
    $lines = file($tokenFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $expected = isset($lines[0]) ? trim($lines[0]) : '';
}
$got = '';
if (!empty($_SERVER['HTTP_X_SYNC_TOKEN'])) {
    $got = trim($_SERVER['HTTP_X_SYNC_TOKEN']);
}
if ($expected === '' || $got === '' || !hash_equals($expected, $got)) {
    sendJson(['ok' => false, 'error' => 'unauthorized'], 401);
}

// ===== 数据读写 =====
function ensureDirs() {
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0700, true);
    }
    if (!is_dir(HISTORY_DIR)) {
        @mkdir(HISTORY_DIR, 0700, true);
    }
    // 站点内若被人直接访问 data 目录，用 .htaccess 兜底拒绝
    $ht = DATA_DIR . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Require all denied\n");
    }
}

/**
 * 读取状态。返回 state 以区分「文件不存在」「正常」「损坏」，
 * 不再把损坏文件当作空账本（那样会让版本号回退、冲突检测失效）。
 *   state: 'empty' | 'ok' | 'corrupt'
 */
function readState() {
    if (!is_file(DATA_FILE)) {
        return ['state' => 'empty', 'version' => 0, 'updatedAt' => null, 'data' => null];
    }
    $raw = @file_get_contents(DATA_FILE);
    if ($raw === false) {
        return ['state' => 'corrupt', 'version' => 0, 'updatedAt' => null, 'data' => null];
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        return ['state' => 'corrupt', 'version' => 0, 'updatedAt' => null, 'data' => null];
    }
    return [
        'state' => 'ok',
        'version' => intval($j['version'] ?? 0),
        'updatedAt' => $j['updatedAt'] ?? null,
        'data' => $j['data'] ?? null,
    ];
}

/** 剔除载荷中的设备本地配置（凭据、锁屏、主题等），返回新数组 */
function stripDeviceSettings($data) {
    if (!is_array($data) || !isset($data['settings']) || !is_array($data['settings'])) {
        return $data;
    }
    $settings = $data['settings'];
    foreach (DEVICE_SETTING_KEYS as $k) {
        unset($settings[$k]);
    }
    $data['settings'] = $settings;
    return $data;
}

/**
 * 写入状态。
 * - 临时文件名唯一（pid + 随机），避免并发请求写同一个 tmp
 * - rename 结果必须校验：失败要返回错误，不能让客户端以为存成功了
 */
function writeState($state) {
    ensureDirs();
    $tmp = DATA_FILE . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
    $ok = @file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX);
    if ($ok === false) {
        @unlink($tmp);
        return false;
    }
    if (!@rename($tmp, DATA_FILE)) {
        @unlink($tmp);
        return false;
    }
    @chmod(DATA_FILE, 0600);
    return true;
}

/**
 * 文件锁：把「读 → 版本判定 → 写」整个临界区锁住。
 * 否则两个并发请求可能读到同一个 version、都通过冲突检查、后写的无声覆盖先写的。
 * @return array [响应体, HTTP 状态码]
 */
function withLock($fn, $exclusive = true) {
    ensureDirs();
    $lockFile = DATA_DIR . '/.lock';
    $fh = @fopen($lockFile, 'c');
    if (!$fh) {
        return [['ok' => false, 'error' => 'lock unavailable'], 500];
    }
    $mode = $exclusive ? LOCK_EX : LOCK_SH;
    if (!flock($fh, $mode)) {
        fclose($fh);
        return [['ok' => false, 'error' => 'lock unavailable'], 500];
    }
    $result = null;
    try {
        $result = $fn();
    } catch (Throwable $e) {
        $result = [['ok' => false, 'error' => 'server error'], 500];
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

function rotateHistory() {
    if (!is_file(DATA_FILE)) {
        return;
    }
    $name = 'snapshot-' . date('Y-m-d') . '.json';
    $target = HISTORY_DIR . '/' . $name;
    if (!is_file($target)) {
        @copy(DATA_FILE, $target);
    }
    $files = @glob(HISTORY_DIR . '/snapshot-*.json');
    if (is_array($files) && count($files) > HISTORY_KEEP) {
        sort($files);
        $extra = array_slice($files, 0, count($files) - HISTORY_KEEP);
        foreach ($extra as $f) {
            @unlink($f);
        }
    }
}

/** 数据文件损坏时先隔离留证，再由调用方决定是否重建 */
function quarantineCorrupt() {
    if (!is_file(DATA_FILE)) {
        return;
    }
    $target = DATA_DIR . '/corrupt-' . date('Ymd-His') . '.json';
    @rename(DATA_FILE, $target);
}

// ===== GET：拉取 =====
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    [$resp, $code] = withLock(function () {
        $s = readState();
        if ($s['state'] === 'corrupt') {
            return [['ok' => false, 'error' => 'data file corrupt'], 500];
        }
        $data = $s['state'] === 'empty' ? null : stripDeviceSettings($s['data']);
        return [[
            'ok' => true,
            'version' => $s['version'],
            'updatedAt' => $s['updatedAt'],
            'data' => $data,
        ], 200];
    }, false);
    sendJson($resp, $code);
}

// ===== POST：推送 =====
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        sendJson(['ok' => false, 'error' => 'bad request'], 400);
    }
    $baseVersion = intval($body['baseVersion'] ?? 0);
    $data = isset($body['data']) ? $body['data'] : null;
    if ($data === null) {
        sendJson(['ok' => false, 'error' => 'missing data'], 400);
    }
    $force = !empty($body['force']);

    // 入库前剔除设备本地配置（令牌 / PIN 哈希 / 锁 / 主题），旧客户端上传也不落盘
    $data = stripDeviceSettings($data);

    [$resp, $code] = withLock(function () use ($baseVersion, $data, $force) {
        $current = readState();

        // 损坏：默认拒绝写入（避免把损坏状态版本号化）；强制覆盖时先隔离留证再重建
        if ($current['state'] === 'corrupt') {
            if (!$force) {
                return [['ok' => false, 'error' => 'data file corrupt'], 500];
            }
            quarantineCorrupt();
            $current = ['state' => 'empty', 'version' => 0, 'updatedAt' => null, 'data' => null];
        }

        // 冲突：服务器版本比客户端基准更新，且不是强制覆盖 → 返回服务器数据，不静默覆盖
        if (!$force && $current['version'] > $baseVersion && $current['data'] !== null) {
            return [[
                'ok' => false,
                'conflict' => true,
                'version' => $current['version'],
                'updatedAt' => $current['updatedAt'],
                'data' => stripDeviceSettings($current['data']),
            ], 409];
        }

        rotateHistory();
        $next = [
            'version' => max($current['version'], $baseVersion) + 1,
            'updatedAt' => date('c'),
            'data' => $data,
        ];
        if (!writeState($next)) {
            return [['ok' => false, 'error' => 'write failed'], 500];
        }
        return [[
            'ok' => true,
            'version' => $next['version'],
            'updatedAt' => $next['updatedAt'],
        ], 200];
    }, true);

    sendJson($resp, $code);
}

sendJson(['ok' => false, 'error' => 'method not allowed'], 405);
