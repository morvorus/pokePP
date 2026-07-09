$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$OutFile = 'C:\Users\peezz\Downloads\pokePP\monsters-data.js'
$MaxId = 1025
$base = 'https://pokeapi.co/api/v2'

function Get-Json($url) {
    for ($i = 0; $i -lt 4; $i++) {
        try { return Invoke-RestMethod -Uri $url -TimeoutSec 30 }
        catch { Start-Sleep -Milliseconds (300 * ($i + 1)) }
    }
    throw "failed: $url"
}

function Get-IdFromUrl($url) {
    if ($url -match '/(\d+)/?$') { return [int]$Matches[1] }
    return $null
}

$mons = @{}
$speciesCache = @{}
$chainUrls = @{}

Write-Host "Fetching pokemon 1..$MaxId"
for ($id = 1; $id -le $MaxId; $id++) {
    $p = Get-Json "$base/pokemon/$id"
    $s = Get-Json "$base/pokemon-species/$id"

    $statMap = @{}
    foreach ($st in $p.stats) { $statMap[$st.stat.name] = [int]$st.base_stat }

    $types = @($p.types | Sort-Object slot | ForEach-Object { $_.type.name })

    $rarity = 'common'
    $cap = [int]$s.capture_rate
    if ($s.is_legendary -or $s.is_mythical) { $rarity = 'legendary' }
    elseif ($cap -le 45) { $rarity = 'rare' }

    $mons[$id] = [ordered]@{
        id          = $id
        name        = (Get-Culture).TextInfo.ToTitleCase($p.name)
        types       = $types
        stats       = [ordered]@{
            hp    = $statMap['hp']
            atk   = $statMap['attack']
            def   = $statMap['defense']
            spatk = $statMap['special-attack']
            spdef = $statMap['special-defense']
            spd   = $statMap['speed']
        }
        rarity      = $rarity
        captureRate = $cap
        genderRate  = [int]$s.gender_rate
        evolvesTo   = $null
        evolveLevel = $null
        evolveItem  = $null
    }

    $chainUrls[$s.evolution_chain.url] = $true
    if (($id % 25) -eq 0) { Write-Host "  ...$id done" }
}

Write-Host "Fetching $($chainUrls.Count) evolution chains"
function Walk-Chain($node) {
    $fromId = Get-IdFromUrl $node.species.url
    foreach ($nxt in $node.evolves_to) {
        $toId = Get-IdFromUrl $nxt.species.url
        if ($fromId -and $toId -and $mons.ContainsKey([int]$fromId) -and $mons.ContainsKey([int]$toId)) {
            $det = $nxt.evolution_details | Select-Object -First 1
            $lvl = $null; $item = $null
            if ($det) {
                if ($det.min_level) { $lvl = [int]$det.min_level }
                if ($det.item -and $det.item.name) { $item = $det.item.name }
                if ($det.trigger.name -eq 'trade') { $item = 'trade' }
            }
            # only take first evolution branch per mon (keep it simple)
            if (-not $mons[[int]$fromId].evolvesTo) {
                $mons[[int]$fromId].evolvesTo   = [int]$toId
                $mons[[int]$fromId].evolveLevel = $lvl
                $mons[[int]$fromId].evolveItem  = $item
            }
        }
        Walk-Chain $nxt
    }
}
foreach ($cu in $chainUrls.Keys) {
    $c = Get-Json $cu
    Walk-Chain $c.chain
}

# Fallback: item-based evolutions with no level -> assign a default level so level-evo path still works
$ordered = $mons.Keys | Sort-Object { [int]$_ } | ForEach-Object { $mons[[int]$_] }
$json = $ordered | ConvertTo-Json -Depth 8

$header = "// Auto-generated from PokeAPI (Gen 1, ids 1-$MaxId). Do not edit by hand.`r`n// Sprites: https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/{id}.gif`r`nconst MONSTERS = "
$footer = ";`r`nif (typeof module !== 'undefined') { module.exports = MONSTERS; }`r`n"

Set-Content -Path $OutFile -Value ($header + $json + $footer) -Encoding UTF8
Write-Host "WROTE $OutFile ($($ordered.Count) monsters)"
