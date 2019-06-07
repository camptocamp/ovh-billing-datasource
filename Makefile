dep:
	docker run --user 1000 -it --workdir /code --rm -v $(shell pwd):/code node npm install
build:
	docker run --user 1000 -it --workdir /code --rm -v $(shell pwd):/code node npm run build
	cp -rf node_modules/crypto-js dist/
run-grafana:
	docker run --rm --user 1000 -p 3000:3000 -v grafana_dev:/var/lib/grafana -v $(pwd):/var/lib/grafana/plugins/ovh-billing-datasource grafana/grafana
