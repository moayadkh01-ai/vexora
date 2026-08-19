#!/bin/bash
# VEXORA deployment supervisor (see keeper.js)
exec node "$(dirname "$0")/keeper.js"
