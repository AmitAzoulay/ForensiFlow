#!/bin/bash
set -e

# ----- server -----
cd server # enter the server directory

pip install --break-system-packages --ignore-installed -r requirements.txt # install server dependencies
pkill -f "server\.py" || true # kill any existing server process if it is running
nohup python3 server.py >> logs/server.log 2>&1 & # run the server in the background and redirect output to a log file
echo "Server started in background with PID $!" 

cd - # go the the root directory of the project

# ----- client -----

cd client # enter the client directory
npm run build # build the client project
cp dist/* /usr/share/nginx/html # copy the output of the build
