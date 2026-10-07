# Loaded invisibly at the start of a VHS take: logs when each command starts and ends (wall clock, seconds since
# epoch) so the assembly can sync the terminal, the dashboard capture and the subtitles.
zmodload zsh/datetime
: "${DEMO_EVENTS:=$PWD/out/events.log}"
preexec() { print -r -- "$EPOCHREALTIME start $1" >> "$DEMO_EVENTS" }
precmd()  { print -r -- "$EPOCHREALTIME end" >> "$DEMO_EVENTS" }
PS1='%F{245}agent%f $ '
