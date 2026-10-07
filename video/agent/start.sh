#!/usr/bin/env zsh
# Starts the demo agent: Claude Code with the perpl-trading skill, only `mm perpl` commands allowed, no MCP servers.
cd "${0:A:h}"
exec claude --model opus --settings demo-settings.json --strict-mcp-config --permission-mode default
