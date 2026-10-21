<?php
/**
 * 小金库 · 自建服务器同步接口（单文件，无需数据库）
 *
 * 接口约定：
 *   GET  /api.php                 → 拉取服务器上的数据
 *   POST /api.php                 → 推送本机数据到服务器
 *   OPTIONS /api.php              → CORS 预检
 *
 * 请求/响应均为 JSON。鉴权使用请求头 X-Sync-Token。
 *
 * 响应格式：
 *   成功 200 {"ok":true,"version":12,"updatedAt":"2026-10-20T14:30:00","data":{...}}
 *   冲突 409 {"ok":false,"conflict":true,"version":13,"updatedAt":"...","data":{...}}
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

// ===== 通用：CORS + JSON =====
function sendCors() {
    // 生产环境建议把 * 改成你自己的域名，如 https://money.example.com
    header('Access-Control-Allow-Origin: *');
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
$tokenFile = DATA_DIR . '/token.txt';
$expected = '';
if (is_file($tokenFile)) {
    $lines = file($tokenFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $expected = isset($lines[0]) ? trim($lines[0]) : '';
}
$got = '';
if (!empty($_SERVER['HTTP_X_SYNC_TOKEN'])) {
    $got = trim($_SERVER['HTTP_X_SYNC_TOKEN']);
} elseif (isset($_GET['token'])) {
    $got = trim($_GET['token']);
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
function readState() {
    if (!is_file(DATA_FILE)) {
        return ['version' => 0, 'updatedAt' => null, 'data' => null];
    }
    $raw = @file_get_contents(DATA_FILE);
    if ($raw === false) {
        return ['version' => 0, 'updatedAt' => null, 'data' => null];
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        return ['version' => 0, 'updatedAt' => null, 'data' => null];
    }
    return [
        'version' => intval($j['version'] ?? 0),
        'updatedAt' => $j['updatedAt'] ?? null,
        'data' => $j['data'] ?? null,
    ];
}
function writeState($state) {
    ensureDirs();
    $tmp = DATA_FILE . '.tmp';
    $ok = @file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX);
    if ($ok === false) {
        return false;
    }
    @rename($tmp, DATA_FILE);
    @chmod(DATA_FILE, 0600);
    return true;
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

// ===== GET：拉取 =====
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $s = readState();
    sendJson([
        'ok' => true,
        'version' => $s['version'],
        'updatedAt' => $s['updatedAt'],
        'data' => $s['data'],
    ]);
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

    $current = readState();

    // 冲突：服务器版本比客户端基准更新，且不是强制覆盖 → 返回服务器数据，不静默覆盖
    $force = !empty($body['force']);
    if (!$force && $current['version'] > $baseVersion && $current['data'] !== null) {
        sendJson([
            'ok' => false,
            'conflict' => true,
            'version' => $current['version'],
            'updatedAt' => $current['updatedAt'],
            'data' => $current['data'],
        ], 409);
    }

    rotateHistory();
    $next = [
        'version' => max($current['version'], $baseVersion) + 1,
        'updatedAt' => date('c'),
        'data' => $data,
    ];
    if (!writeState($next)) {
        sendJson(['ok' => false, 'error' => 'write failed'], 500);
    }
    sendJson([
        'ok' => true,
        'version' => $next['version'],
        'updatedAt' => $next['updatedAt'],
    ]);
}

sendJson(['ok' => false, 'error' => 'method not allowed'], 405);
