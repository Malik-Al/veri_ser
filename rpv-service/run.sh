#!/bin/bash
docker run --rm --name rpv-service -p 8080:8080 -e TZ=Asia/Bishkek -e PGTZ=Asia/Bishkek -e ORA_SDTZ=Asia/Bishkek rpv-service-image