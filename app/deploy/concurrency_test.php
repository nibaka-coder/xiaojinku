<?php
/**
 * 并发安全自测（T4b）—— 需在**服务器上**执行，本地沙箱无 PHP 环境跑不了。
 *
 * 目的：验证 api.php 的 flock 锁确实把「读 → 版本判定 → 写」串行化了。
 * 期望：N 个并发 POST（同一 baseVersion）中恰好 1 个 200、其余 409，
 *       且版本号只推进 1（不是 N）。
 *       若出现多个 200，说明锁没生效 → 并发会静默覆盖，必须修。
 *
 * 用法（SSH 到服务器）：
 *   php /root/myapp/xiaojinku/app/deploy/concurrency_test.php \
 *       https://xiaojinku.19950920.xyz/sync/api.php 你的令牌
 *
 * 注意：本脚本会真实写入服务器数据文件。请先备份：
 *   cp <DATA_DIR>/xiaojinku.json ~/xiaojinku.bak.$(date +%F).json
 * 测试用数据是一份极小的占位账本，验证完建议在应用内再同步一次恢复正常数据。
 */

$url = $argv[1] ?? '';
$token = $argv[2] ?? '';
if ($url === '' || $token === '') {
    fwrite(STDERR, "用法: php concurrency_test.php <api.php 的完整 URL> <令牌>\n");
    exit(1);
}

$N = 5;
$payload = [
    'app' => 'xiaojinku',
    'version' => 3,
    'exported_at' => gmdate('c'),
    'liabilities' => [],
    'categories' => [],
    'transactions' => [],
    'securities' => [],
    'investTxns' => [],
    'settings' => ['defaultCurrency' => 'CNY', 'cashOpening' => 0],
];

// 先取当前服务器版本，作为所有并发请求的共同基准
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Sync-Token: ' . $token],
    CURLOPT_TIMEOUT => 15,
]);
$raw = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$j = json_decode((string)$raw, true);
if ($code !== 200 || !is_array($j)) {
    fwrite(STDERR, "读取服务器状态失败：HTTP {$code} {$raw}\n");
    exit(1);
}
$baseVersion = intval($j['version'] ?? 0);
echo "当前服务器版本：{$baseVersion}\n";
echo "发起 {$N} 个并发 POST（同一 baseVersion）...\n\n";

$mh = curl_multi_init();
$handles = [];
for ($i = 0; $i < $N; $i++) {
    $body = json_encode([
        'baseVersion' => $baseVersion,
        'data' => $payload,
        'force' => false,
    ], JSON_UNESCAPED_UNICODE);
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Sync-Token: ' . $token],
        CURLOPT_TIMEOUT => 30,
    ]);
    curl_multi_add_handle($mh, $c);
    $handles[] = $c;
}
$running = null;
do {
    curl_multi_exec($mh, $running);
    curl_multi_select($mh, 0.05);
} while ($running > 0);

$codes = [];
foreach ($handles as $c) {
    $codes[] = curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_multi_remove_handle($mh, $c);
    curl_close($c);
}
curl_multi_close($mh);

sort($codes);
$ok = 0;
$conflict = 0;
$other = 0;
foreach ($codes as $c) {
    if ($c === 200) {
        $ok++;
    } elseif ($c === 409) {
        $conflict++;
    } else {
        $other++;
    }
}
echo "响应码：" . implode(', ', $codes) . "\n";
echo "成功 200：{$ok}　冲突 409：{$conflict}　其它：{$other}\n\n";

// 再取一次版本，确认只推进了 1
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Sync-Token: ' . $token],
    CURLOPT_TIMEOUT => 15,
]);
$raw2 = curl_exec($ch);
$j2 = json_decode((string)$raw2, true);
curl_close($ch);
$after = intval($j2['version'] ?? -1);
echo "测试后服务器版本：{$after}（期望 " . ($baseVersion + 1) . "）\n";

$pass = ($ok === 1) && ($conflict === $N - 1) && ($other === 0) && ($after === $baseVersion + 1);
echo $pass
    ? "\nRESULT: PASS —— 锁生效，并发不会静默覆盖\n"
    : "\nRESULT: FAIL —— 出现多个成功或版本号异常推进，说明并发会静默覆盖，请检查 flock 是否可用\n";
exit($pass ? 0 : 1);
