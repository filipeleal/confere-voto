# Geografia do mapa de chegada

Obtida em 2026-10-08. Os arquivos são servidos localmente, sem consulta externa pelo navegador.

- `states.json`: IBGE, https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF — 27 geometrias estaduais simplificadas.
- `cities.json`: https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json — compilação independente de 5.571 sedes municipais.
- `state-codes.json`: https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/estados.json — UFs e códigos geográficos.

Os dois últimos arquivos foram normalizados para JSON UTF-8 sem BOM. Correspondência por UF e nome exato após normalização de acentos, espaços e pontuação, somente quando único. Não há correspondência aproximada nem equivalência presumida entre códigos TSE e IBGE. Falhas ficam sem coordenadas na tabela e fora da comparação por distância.
