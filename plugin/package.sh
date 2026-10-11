#!/bin/sh
# Builds the two upload zips into plugin/dist/:
#   tigerworkouts-claude.zip  → claude.ai Customize → Plugins → Upload, or the Claude directory portal
#   tigerworkouts-openai.zip  → OpenAI Platform → Plugins → Upload (Agent Plugins format)
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
common="README.md LICENSE skills assets"
zip -qr dist/tigerworkouts-claude.zip .claude-plugin .mcp.json $common -x '.DS_Store' '*/.DS_Store'
zip -qr dist/tigerworkouts-openai.zip plugin.json mcp.json $common -x '.DS_Store' '*/.DS_Store'
ls -l dist
