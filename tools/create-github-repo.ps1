#Requires -Version 5.1
<#
.SYNOPSIS
    Apply governance/repository-settings.json and governance/branch-protection.json
    to the GitHub repository (idempotent).

.DESCRIPTION
    The repository already exists, so this script only pushes the desired state:
    repository settings, topics, and main's branch protection. Re-running it
    after a settings or rule change is the intended way to re-apply them.

    The token needs administration:write on the repository. It is never written
    to disk: pass -Token or set $env:GH_TOKEN / $env:GITHUB_TOKEN.

.EXAMPLE
    $env:GITHUB_TOKEN = '<token with administration:write>'
    pwsh -File tools/create-github-repo.ps1 -Owner cadywang

.EXAMPLE
    # Print the API calls without touching GitHub
    pwsh -File tools/create-github-repo.ps1 -Owner cadywang -DryRun
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [string]$Repo = 'cadywang.github.io',
  [string]$Token = '',
  [string]$BaseBranch = 'main',
  [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$api = 'https://api.github.com'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  if (-not $Token) {
    $Token = if ($env:GH_TOKEN) { $env:GH_TOKEN } elseif ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { '' }
  }
  if (-not $Token -and -not $DryRun) {
    throw 'pass -Token or set $env:GITHUB_TOKEN (needs administration:write on this repository)'
  }

  $headers = @{
    'Authorization' = "Bearer $Token"
    'Accept'        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'    = 'cadywang.github.io-governance'
  }

  $settings = Get-Content -Raw -Encoding UTF8 "$root\governance\repository-settings.json" | ConvertFrom-Json
  $protection = Get-Content -Raw -Encoding UTF8 "$root\governance\branch-protection.json" | ConvertFrom-Json

  function Invoke-Gh([string]$Method, [string]$Uri, $Body) {
    if ($DryRun) {
      Write-Host "[dry-run] $Method $Uri"
      if ($null -ne $Body) { Write-Host ($Body | ConvertTo-Json -Depth 10) }
      return
    }
    try {
      if ($null -ne $Body) {
        Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json' `
          -Body ([System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10))) | Out-Null
      } else {
        Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers | Out-Null
      }
    } catch {
      $detail = ''
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $detail = $sr.ReadToEnd()
      } catch { }
      Write-Host "FAILED: $Method $Uri`n$detail"
      throw
    }
  }

  Write-Host '==> repository settings'
  # Only the fields this repository's strategies accept: squash and merge
  # commits are off, and GitHub rejects their title/message fields in that state.
  $payload = @{
    description            = $settings.description
    homepage               = $settings.homepage
    has_issues             = [bool]$settings.has_issues
    has_projects           = [bool]$settings.has_projects
    has_wiki               = [bool]$settings.has_wiki
    has_discussions        = [bool]$settings.has_discussions
    allow_squash_merge     = [bool]$settings.allow_squash_merge
    allow_merge_commit     = [bool]$settings.allow_merge_commit
    allow_rebase_merge     = [bool]$settings.allow_rebase_merge
    allow_auto_merge       = [bool]$settings.allow_auto_merge
    delete_branch_on_merge = [bool]$settings.delete_branch_on_merge
  }
  Invoke-Gh 'PATCH' "$api/repos/$Owner/$Repo" $payload
  if ($settings.topics) {
    try {
      Invoke-Gh 'PUT' "$api/repos/$Owner/$Repo/topics" @{ names = @($settings.topics) }
    } catch {
      # Topics need their own permission; do not lose the protection step
      # over a cosmetic field.
      Write-Host '    warn: cannot set topics with this token; continuing'
    }
  }

  Write-Host "==> protect $BaseBranch"
  $prot = @{
    required_status_checks = @{
      strict   = [bool]$protection.required_status_checks.strict
      contexts = @($protection.required_status_checks.contexts)
    }
    enforce_admins                  = [bool]$protection.enforce_admins
    required_pull_request_reviews   = @{
      dismiss_stale_reviews           = [bool]$protection.required_pull_request_reviews.dismiss_stale_reviews
      require_code_owner_reviews      = [bool]$protection.required_pull_request_reviews.require_code_owner_reviews
      required_approving_review_count = [int]$protection.required_pull_request_reviews.required_approving_review_count
      require_last_push_approval      = [bool]$protection.required_pull_request_reviews.require_last_push_approval
    }
    restrictions                    = $null
    required_linear_history         = [bool]$protection.required_linear_history
    allow_force_pushes              = [bool]$protection.allow_force_pushes
    allow_deletions                 = [bool]$protection.allow_deletions
    block_creations                 = [bool]$protection.block_creations
    required_conversation_resolution = [bool]$protection.required_conversation_resolution
    lock_branch                     = [bool]$protection.lock_branch
    allow_fork_syncing              = [bool]$protection.allow_fork_syncing
  }
  Invoke-Gh 'PUT' "$api/repos/$Owner/$Repo/branches/$BaseBranch/protection" $prot

  Write-Host 'done'
} finally {
  Pop-Location
}
