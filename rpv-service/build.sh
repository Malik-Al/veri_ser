#!/bin/bash

VERSION=$(npm run version --silent)
NAME=rpv-service
TARGET=roman@10.185.232.46

echo "Build and push version: ${VERSION}"

# Сборка контейнера
docker build --network=host -t opt/$NAME:${VERSION} ./

# Экспорт в файл
mkdir -p ~/builds/$NAME-${VERSION}
docker save opt/$NAME:${VERSION} > ~/builds/$NAME-${VERSION}/$NAME-${VERSION}.tar
gzip -f ~/builds/$NAME-${VERSION}/$NAME-${VERSION}.tar

# Создание каталогов msdata
mkdir -p ~/builds/$NAME-${VERSION}/msdata/data
mkdir -p ~/builds/$NAME-${VERSION}/msdata/scripts

# Копирование каталогов msdata
cp -R msdata/* ~/builds/$NAME-${VERSION}/msdata/data


# Создание скрипта импорта контейнера
file=~/builds/$NAME-${VERSION}/import-$NAME-${VERSION}.sh

if [ -f "$file" ] ; then
    rm "$file"
fi

echo "#!/bin/bash" >> $file
echo "gunzip "$NAME-${VERSION}".tar.gz -d" >> $file
echo "docker load -i "$NAME-${VERSION}".tar" >> $file

chmod +x $file


# Создание скрипта запуска контейнера
file=~/builds/$NAME-${VERSION}/msdata/scripts/run.sh
if [ -f "$file" ] ; then
    rm "$file"
fi

echo "#!/bin/bash" >> $file

echo "docker run --restart=always -d --name "$NAME" \\" >> $file
echo "-e TZ=Asia/Bishkek -e PGTZ=Asia/Bishkek -e ORA_SDTZ=Asia/Bishkek \\" >> $file
echo "-p 9030:9030 \\" >> $file
echo "-v /msdata/"$NAME"/data:/usr/src/app/msdata -v /etc/localtime:/etc/localtime \\" >> $file
echo "-d opt/"$NAME":"${VERSION} >> $file

chmod +x $file

# Создание скрипта остановки контейнера

file=~/builds/$NAME-${VERSION}/msdata/scripts/stop.sh
if [ -f "$file" ] ; then
    rm "$file"
fi

echo "#!/bin/bash" >> $file
echo "docker rm -f "$NAME >> $file
chmod +x $file

# Копирование всего каталога на remote сервер
scp -r ~/builds/$NAME-${VERSION} $TARGET:~/builds/$NAME-${VERSION}

