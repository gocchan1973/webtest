# 読み取り専用。キーの値は表示・保存しない（名前・行番号・「値らしき文字列が有るか」の true/false だけ出す）。
# 使い方: pwsh -File F:\Dev_hub\p-p-TechNews\docs\check-plaintext-keys.ps1
param(
    [string[]]$EnvNames = @('GOOGLE_API_KEY')
)

$targets = @(
    (Join-Path $HOME '.codex\config.toml'),
    (Join-Path $HOME '.codex\rules\default.rules'),
    (Join-Path $env:LOCALAPPDATA 'hermes\config.yaml')
)
$namePattern = '[A-Za-z0-9_]*(api[_-]?key|token|secret)[A-Za-z0-9_]*'

foreach ($path in $targets) {
    Write-Host "== $path"
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host '  (見つかりません)'
        continue
    }
    $lineNo = 0
    $found = 0
    foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
        $lineNo++
        $m = [regex]::Match($line, $namePattern, 'IgnoreCase')
        if (-not $m.Success) { continue }
        $found++
        $rest = $line.Replace($m.Value, '')
        $hasLiteral = [regex]::IsMatch($rest, '[A-Za-z0-9_\-]{20,}')
        Write-Host ("  {0} 行目: 名前={1} / 値らしき文字列={2}" -f $lineNo, $m.Value, $hasLiteral)
    }
    Write-Host ("  該当 {0} 行" -f $found)
}

Write-Host '== ユーザー環境変数（設定済みかどうかだけ。値は表示しない）'
foreach ($n in $EnvNames) {
    $v = [Environment]::GetEnvironmentVariable($n, 'User')
    $isSet = -not [string]::IsNullOrEmpty($v)
    Write-Host ("  {0}: {1}" -f $n, $isSet)
}
Write-Host '== 完了。ローテーションと移行が済めば、「値らしき文字列」がすべて False になる想定です。'
