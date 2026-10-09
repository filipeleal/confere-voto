# Confere Voto

Sistema web de contagem dos boletins de urna e consulta dos resultados do TSE. Presidente, Brasil e exterior, primeiro turno de 2026. Interface em azul, verde, amarelo e branco.

## Executar localmente

Requer Node.js 22+ e Python 3.11+. O servidor não tem dependências npm. O leitor ASN.1 usa `asn1tools` e o esquema oficial de 2026 preservado em `vendor/tse`.

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
npm start
# http://localhost:3000
```

Em Linux/macOS: `.venv/bin/python -m pip install -r requirements.txt`. É possível definir `PYTHON` com o caminho do interpretador. Execute na raiz do projeto. O servidor escuta somente em 127.0.0.1, porta 3000 (ou `PORT`).

## Usar a contagem

1. Selecione UF e município na área Boletins.
2. Em Nossa contagem, escolha município, UF ou Brasil e exterior e clique em Iniciar contagem.
3. Acompanhe a coleta e abra Conferir contagem para ver a comparação e os votos de cada BU.
4. Os lotes podem ser pausados e retomados. Reiniciar o servidor pausa o lote; use Retomar lote. O município interrompido é recontado por inteiro.

A coleta nacional pode levar dias e consumir vários GB. O servidor precisa continuar aberto. Há um município ativo por vez, com até 25 BUs processados simultaneamente, inclusive nos retries. As consultas da coleta ao TSE têm limite de 25 requisições em voo e partidas espaçadas em pelo menos 50 ms (até 20 partidas por segundo). Pausas e falhas aguardam as tarefas em voo; as gravações de cada relatório são serializadas. Não há automação externa ou publicação. Nesta entrega foi executado um município completo, não a coleta nacional.

## Regras da soma

- O catálogo EA16 identifica as seções. Seções agregadas não são somadas novamente.
- O EA18 precisa indicar seção Totalizada e exatamente um BU Totalizado. Versões rejeitadas/excluídas e situações ambíguas não entram.
- O BU é decodificado em BER com o leiaute oficial, restrições ASN.1 e rejeição de bytes extras. São verificados fase oficial, pleito 3220, eleição 6257, presidente, município, zona, seção e data de emissão 04/10/2026.
- Somam-se votos nominais, brancos e nulos desse cargo. Tipos inesperados, tuplas duplicadas, votos negativos e diferenças em relação ao comparecimento do cargo bloqueiam o BU.
- Seções principais são únicas pela chave UF/município/zona/seção. A última execução de cada município substitui a anterior no acumulado; nunca se somam versões de um município.
- BUs emitidos em outra data e casos especiais não suportados ficam pendentes para revisão. Não se interpreta silenciosamente um formato diferente.

## Flags e comparação

**Valores coincidem:** todos os BUs esperados passaram pela validação, a totalização municipal está encerrada, as quantidades de seções apuradas correspondem, não há destinação especial e os snapshots do resultado/catálogo permaneceram estáveis durante a coleta. Candidatos, brancos, nulos e total coincidem.

**Discrepância numérica:** nas mesmas condições acima, pelo menos uma categoria difere. O delta é nossa soma menos TSE. Isso sinaliza investigação, sem atribuir causa.

**Comparação pendente:** coleta incompleta, arquivo inválido/ambíguo, mudança dos dados, escopo incompatível, seções não apuradas ou destinação especial (nulos técnicos ou votos anulados, por exemplo). Não se exibe um delta enganoso contra um total maior.

As comparações são municipais. O acumulado nacional da base é explicitamente parcial e não é comparado com o total nacional do TSE. Relatórios são fotografias dos dados coletados, não um monitor contínuo: execute nova contagem para reavaliar atualizações posteriores. A estabilidade das cópias da CDN não representa garantia de uma transação atômica de todos os sistemas do TSE.

## Evidências persistidas

`data/snapshots`: BUs binários e JSONs originais, identificados por SHA-256, origem e horário de coleta.

`data/audits`: relatórios com totais, seções incluídas, hashes, pendências e comparação. Escritas usam arquivo temporário seguido de rename. Relatórios anteriores continuam acessíveis por ID; o painel exibe a execução mais recente de cada município. `campaign.json` guarda a fila e o ponto de retomada.

Baixar cópia usada na soma baixa o binário preservado. Original no TSE acessa a fonte. Também se preservam o catálogo auxiliar de cada seção e os snapshots municipais antes/depois.

**As assinaturas digitais não são verificadas nesta versão.** O SHA-256 identifica uma cópia; não certifica autenticidade. Esta é uma soma independente dos arquivos publicados pelo TSE, sem comparação com BUs físicos.

## Google Analytics

Defina `GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX` no ambiente do servidor com o ID de medição da propriedade GA4. Ao usar `.env.production`, inicie com `node --env-file=.env.production server.mjs` e reinicie após alterar a configuração. Sem ID, o Analytics permanece desativado; IDs inválidos impedem a inicialização.

A integração registra visualizações das páginas `/`, `/mapa` e `/cargos` usando a Google tag, com Google Signals e personalização de anúncios desativados. A tela de acesso não recebe a tag. Para validar a ativação, abra uma página e confira a visita no relatório Em tempo real do GA4 (bloqueadores de rastreamento podem impedir o envio).

## Testes

```powershell
npm test
.venv/Scripts/python.exe -m unittest discover -s test -p 'test_*.py'
```

Testes cobrem discrepâncias de um voto, brancos/nulos, candidatos ausentes, cobertura incompleta, snapshots, destinação especial, duplicatas, agregadas, recebimentos, identificação do BU, simulado e soma incorreta. Valores sintéticos ficam nos testes.

Validação real: Porto Walter/AC, 34 BUs, 6.520 votos, 49 brancos e 175 nulos; todas as categorias coincidiram com o resultado municipal na coleta de 05/10/2026. Relatórios e BUs completos ficam em `data`, ignorado no Git.

## Linha do tempo e retry

Os detalhes municipais exibem todas as verificações da comparação: caminho do campo, valor bruto, presença/ausência, valor exigido, resultado, próximo passo e cópia usada como evidência. A exigência de zero para `van`, `vansj`, `vsan` e `vscv` é uma restrição do comparador atual, não uma irregularidade atribuída ao TSE. A ausência de atributos condicionais do EA20 não prova erro na fonte e não é silenciosamente convertida em zero. Descrições: EA20 de 10/07/2026, páginas 19–22. Relatórios concluídos anteriores recebem explicações recalculadas em memória a partir dos mesmos arquivos salvos, com essa origem explicitada; nenhuma nova coleta é usada nessa reavaliação. As diferenças liberadas exibem os dois valores e a subtração BUs menos TSE por categoria.

Em Documentos de origem, a consulta de seção também decodifica cada BU listado e exibe identificação, emissão, eleitores aptos, comparecimento, votos presidenciais por número de candidato, brancos, nulos e total. O download original continua disponível, junto à cópia exata usada e seu SHA-256. Falhas de leitura preservam os links e permitem tentar novamente. A consulta não altera a contagem própria. A API `/api/bulletin-decoded` aceita somente arquivos presentes no catálogo da seção consultada.

A linha do tempo abre em 4/10/2026, 19h–21h, permite filtrar município e evento e mostra faixas sem eventos e lacunas entre BUs conhecidos. Recebimento e geração do auxiliar usam o relógio civil do EA18, cujo fuso não é declarado; não equivalem automaticamente ao horário de totalização. Download e contabilização local são exibidos em Brasília. Recebimentos históricos são recuperados das cópias do EA18; contabilizações antigas sem registro permanecem desconhecidas. A base parcial não permite concluir que houve uma paralisação nacional. O horário de recebimento corresponde ao arquivo selecionado, não a todo o histórico de retransmissões.

Os cartões municipais permitem tentar novamente os erros, e os detalhes oferecem retry por seção. A tentativa cria um relatório vinculado ao anterior, preserva BUs bem-sucedidos e substitui o município no acumulado sem duplicar votos. Apenas as seções selecionadas são reprocessadas; os catálogos e o resultado municipal são consultados novamente para validar a comparação. Alterações no catálogo das seções preservadas mantêm a comparação pendente. Eventos de tentativa, erro e contabilização são registrados a partir desta versão. API: `GET /api/timeline` e `POST /api/audit/retry?id=...&zone=...&section=...`.

## Referências públicas

- [Leiaute BU/RDV/assinaturas 2026](https://www.tse.jus.br/eleicoes/eleicoes-2026). Origem e hashes em `vendor/tse/PROVENANCE.md`.
- [Documentação de divulgação](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados).
- [EA11](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json): ciclo ele2026, pleito 3220, eleição 6257, cargo 1, turno 1.

## Antes de publicar

### Administração

Configure o primeiro administrador com `node scripts/setup-admin.mjs`. A senha aleatória é entregue em `data/admin/credenciais.txt`, fora do Git; guarde-a em um gerenciador e remova esse arquivo após guardar. O servidor usa apenas o hash scrypt de `data/admin/account.json`. Para trocar a senha, execute `node scripts/setup-admin.mjs --reset` e reinicie o servidor, invalidando as sessões. Não há cadastro público ou senha padrão.

O botão Administrador abre o login. Iniciar, pausar, retomar lotes e retries municipais exigem sessão válida na API. Cookies são HttpOnly/SameSite=Strict, expiram em oito horas e são revogados ao sair; reiniciar o servidor também encerra sessões. Há limite de tentativas por endereço e global. O logout não pausa uma coleta já iniciada.

No beta público, configure `PUBLIC_ORIGIN=https://conferevoto.com.br` (sem barra final) e use HTTPS no proxy reverso para o servidor local; essa origem determina a proteção contra requisições externas e ativa o cookie Secure. O padrão é `http://localhost:3000` para desenvolvimento local. Os dados públicos permanecem acessíveis sem login. O sistema tem uma conta administrativa, sem recuperação por e-mail.

O controle de coleta exige autenticação administrativa e validação de origem. Para publicação, separar coletor da API pública, adicionar armazenamento/indexação para escala nacional, retenção, observabilidade e HTTPS. Hoje os relatórios ficam em arquivos e os registros são carregados em memória; ainda não houve teste de carga nacional.


## Reconciliação de nulos

`vnt` não precisa ser zero. O comparador exige `vn`, `vnt` e `tvn` inteiros não negativos e a identidade `tvn = vn + vnt`. Com cobertura e estabilidade aprovadas, compara nulos do BU com `vn`; soma votos nominais em números ausentes da lista municipal e os confronta com `vnt`; compara a soma reconstruída com `tvn`. Essa classificação dos números ausentes é uma hipótese explicitamente indicada, com vínculos aos BUs e seções de origem. Quando todas as contas fecham, o estado é `match` (Valores coincidem); a hipótese de destinação continua registrada nos detalhes. Valores diferentes continuam sinalizados; campos ausentes ou composição oficial inconsistente bloqueiam a comparação. Os votos originais não são modificados. Não há atribuição da causa jurídica a um número com base somente em sua ausência no EA20.


O botão administrativo Tentar todos os erros processa sequencialmente os últimos relatórios municipais com erros, uma tentativa por município, preservando os BUs válidos. Pause uma coleta ativa antes de usar. Pausar coleta também pausa este lote. Após pausa ou reinício, o botão monta uma nova fila a partir dos erros que ainda existem. A fila de retry não substitui o lote nacional salvo.

Para iniciar em produção após configurar HTTPS e proxy, copie `.env.production.example` para `.env.production` e execute `node --env-file=.env.production server.mjs`. O desenvolvimento continua em localhost. Configurar o domínio no código não altera DNS nem publica o site.


## Outros cargos

A página `/cargos` mantém Governador, Senador, Deputado federal, Deputado estadual, Deputado distrital e Conselheiro distrital separados por cargo e UF. Presidente permanece na página inicial. Números iguais de UFs diferentes não são somados como um mesmo candidato. Há filtros municipais, referência EA20 separada, busca de candidatos, evidências por seção e linha do tempo do recebimento com CSV.

O processo `scripts/offices_service.py`, iniciado pelo servidor, reprocessa somente cópias locais dos BUs admitidos pela coleta presidencial. Não baixa tudo novamente. O índice SQLite `data/offices.sqlite` usa WAL, cache por SHA-256 e publica totais municipais em transações, usando a última contagem por município. O progresso global e erros são expostos na página. Novos relatórios são detectados após cada rodada, com intervalo de 60 segundos; uma rodada inicial grande pode levar tempo. Um cargo ausente não é sintetizado como zero. Os filtros de cargos são independentes da coleta administrativa.

O decodificador confere identidade, eleição, fase oficial, duplicações, votos nominais, legenda, brancos, nulos e cargo sem candidato. Em 2026 o Senado soma dois votos por comparecimento. Deputados e Conselheiro têm legenda separada. Esses totais **ainda não têm conciliação automática** com a destinação publicada no EA20; a referência oficial não é usada para declarar coincidência de uma base parcial. Assinaturas digitais continuam não verificadas. Vice e suplentes não têm votação independente.

A linha do tempo dos novos cargos usa o recebimento original no EA18; não atribui a eles a data de contagem presidencial como data de reprocessamento. Testes: `npm test` e `.venv/Scripts/python.exe -m unittest discover -s test -p 'test_*.py'`.

## Desempenho do painel

`GET /api/audits` retorna apenas resumos municipais, contagem de pendências e nomes de candidatos. Evidências, diagnósticos e histórico continuam disponíveis em `GET /api/audit?id=...`, carregado ao abrir um município. O painel envia o `cursor` recebido nas consultas seguintes e mescla somente os municípios alterados, pela chave UF/município. Cursor inválido ou de outro processo provoca um snapshot completo; retries substituem a versão anterior.

A linha do tempo só consulta enquanto seu painel está aberto e a aba está visível. Atualizações automáticas dos gráficos têm intervalo mínimo de 30 segundos; mudanças manuais dos filtros continuam imediatas. A concorrência da coleta permanece em 25 BUs.

Benchmark local, sem alterar a coleta: `node scripts/benchmark-overview.mjs`. Os tamanhos medidos correspondem à lista de relatórios e ao protocolo incremental, sem os pequenos totais e metadados globais da API. Para ativar alterações do servidor, pause a coleta, aguarde as tarefas em voo, reinicie com o comando habitual, atualize a página e retome o lote.


## Limites das consultas públicas

A API pública tem admissão independente do controle administrativo: 120 requisições por minuto por endereço, 1.200 no total e até 32 consultas em andamento. Excesso de frequência retorna HTTP 429; capacidade esgotada retorna HTTP 503. Ambos incluem `Retry-After`. O endereço vem da conexão TCP; cabeçalhos de encaminhamento não são confiados. Atrás de proxy reverso, seus visitantes compartilham o limite por endereço do proxy.

Downloads públicos usam até 4 vagas, 20 pedidos distintos pendentes (incluindo os ativos) e partidas espaçadas por 200 ms. A coleta mantém 25 vagas, 100 pedidos pendentes e 50 ms entre partidas. Cada cliente tem seu próprio cache, deduplicação, fila e pausa após erros do TSE. Consultas públicas não ocupam vagas da coleta. Uma consulta fresca não reutiliza um pedido comum em andamento.

A decodificação pública presidencial admite 2 processos ativos e 8 pedidos distintos em espera; os outros cargos admitem 1 consulta de decodificação ativa e 8 em espera. Cada fila mantém até 256 resultados por 5 minutos, com descarte do menos recentemente usado. A chave inclui SHA-256 e identidade esperada; pedidos idênticos compartilham o trabalho, falhas não ficam no cache e o catálogo da seção continua sendo validado antes de consultar o cache presidencial. A coleta conserva seus próprios decodificadores.

Os limites e caches são locais ao processo. API, coleta e índice ainda compartilham a máquina, disco e processo Node; isso não constitui isolamento de infraestrutura. Reinicie o servidor para ativar as alterações, após pausar e drenar a coleta.


## Mapa de chegada

A página `/mapa`, acessível pelo menu, mostra as sedes municipais coloridas pelo recebimento civil do EA18: primeiro, mediana, P90 interpolado e último. Clique em uma UF para ampliar; pontos e tabela abrem detalhes. A escala nacional entre os percentis 5 e 95 satura extremos sem alterar os horários. A comparação por distância à capital usa medianas municipais com peso igual, separando capitais, até 100 km, 100–300 km e acima de 300 km. Distância não equivale a ruralidade. Fuso não declarado, cobertura parcial e municípios sem correspondência geográfica são informados.

`GET /api/arrival-map` resume a última contagem de cada município brasileiro, sem download adicional nem exportar registros individuais. As geometrias e coordenadas ficam locais em `public/geo`; fontes em `PROVENANCE.md`. Reinicie o servidor para carregar a nova rota quando for apropriado pausar a coleta. Para prévia somente de leitura dos relatórios salvos, execute `node scripts/preview-arrival-map.mjs` e abra `http://localhost:3001/mapa` (fotografia da base no início da prévia; não recupera horários históricos ausentes a partir dos snapshots).

## Contato privado

O botão “Contato / Reportar problema” aparece no rodapé das três páginas. O formulário envia assunto, mensagem (10–4.000 caracteres), e-mail de resposta opcional e o contexto da página/cargo para `POST /api/contact`. O destinatário `conferevoto@outlook.com` fica somente no servidor; não é incluído no HTML, JavaScript público ou respostas da API. Nenhum e-mail automático é enviado ao visitante.

Para ativar o encaminhamento:

1. Contrate ou configure um provedor de envio SMTP e valide nele um endereço remetente.
2. Execute `npm install` e preencha `SMTP_HOST`, `SMTP_PORT` (587 com STARTTLS obrigatório ou 465 com TLS), `SMTP_USER`, `SMTP_PASSWORD` e `CONTACT_FROM` em `.env.production`, usando `.env.production.example` como referência. `CONTACT_FROM` deve ser o remetente autorizado pelo provedor; o Outlook informado é apenas o destinatário e não precisa ser o serviço de envio.
3. Configure `PUBLIC_ORIGIN` com a origem pública do site. Pause e drene a coleta antes de reiniciar com `node --env-file=.env.production server.mjs`; depois retome a coleta.
4. Faça um envio pelo formulário e confirme o recebimento na caixa de destino, incluindo a pasta de spam. Aceitação pelo SMTP não garante chegada à caixa de entrada.

As credenciais ficam fora do Git. Sem configuração SMTP, a API retorna indisponibilidade, sem confirmar envio. Falhas mantêm o texto no formulário; mensagens não são arquivadas localmente nem enfileiradas. O e-mail do visitante é usado somente como Reply-To. Responder pelo Outlook revela ao visitante o endereço dessa conta.

Proteção básica: origem exata e cabeçalho próprio, validação de campos, campo armadilha para bots, limite de 16 KB por requisição, 5 tentativas por IP e 30 no total por 15 minutos, até dois envios simultâneos e TLS obrigatório. Os limites são locais ao processo e zeram no reinício. Atrás de proxy reverso, todos compartilham o limite do proxy; cabeçalhos de IP enviados pelo cliente não são confiados. Esta proteção não substitui CAPTCHA ou filtragem no proxy em caso de abuso. Erros SMTP não são devolvidos ao navegador.

Transporte implementado com [Nodemailer SMTP](https://nodemailer.com/smtp). Testes automatizados usam transporte simulado e não enviam e-mails reais.

## Senha de entrada no site

Todo o site exige uma senha de visitante, inclusive APIs, arquivos e downloads. A tela `/acesso` é pública. Essa senha não concede poderes administrativos; o login de administrador continua separado. Sem `data/access/account.json`, o acesso permanece bloqueado.

Execute `node scripts/setup-access.mjs` antes da primeira publicação. A senha gerada fica em `data/access/credenciais.txt`, ignorado pelo Git. Guarde-a em um gerenciador, compartilhe com os visitantes autorizados e remova o arquivo de texto após guardar. Leve `data/access/account.json` ao servidor por um canal privado. Para trocar a senha, execute `node scripts/setup-access.mjs --reset` e reinicie o servidor; todas as sessões de visitante anteriores são encerradas. As sessões duram oito horas e usam cookies HttpOnly/SameSite=Strict, com Secure quando PUBLIC_ORIGIN usa HTTPS. Há limite de tentativas de senha.

Use HTTPS e PUBLIC_ORIGIN correspondente ao domínio publicado. O proxy deve encaminhar todas as rotas a este servidor, sem servir a pasta public ou data diretamente. Pause e drene a coleta antes de reiniciar para ativar esta mudança. Esta restrição substitui o acesso público sem login descrito anteriormente.

## Azure App Service com Docker

O `Dockerfile` inclui Node.js 22, Python e as dependências de produção. O servidor aceita `HOST` e `PORT`; fora do contêiner, o padrão continua sendo `127.0.0.1:3000`. `.dockerignore` e `.azignore` excluem dados, credenciais, ambiente virtual e saídas locais do contexto de construção.

Construção local, quando Docker estiver instalado:

```powershell
docker build -t confere-voto:v1 .
```

Ou construção no Azure Container Registry (substitua o nome do registro):

```powershell
az acr build --registry SEU_REGISTRO --image confere-voto:v1 .
```

No App Service Linux, use uma única instância, HTTPS Only e Always On. Configure `PUBLIC_ORIGIN` com a URL HTTPS exata, sem barra final, e `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`. No modelo clássico de contêiner, configure `WEBSITES_PORT=3000`; no modelo com sidecar, configure a porta de destino do contêiner principal como 3000. A imagem já define `HOST=0.0.0.0`, `PORT=3000`, `PYTHON=/opt/venv/bin/python` e `OFFICE_DB_PATH=/tmp/offices.sqlite`.

O caminho `/app/data` aponta para `/home/confere-voto-data`. Transfira para esse destino as pastas `access`, `admin`, `audits` e `snapshots` da base local, preservando a estrutura. Transfira apenas `account.json` das pastas de autenticação, sem os arquivos `credenciais.txt`. Pause e drene a coleta antes de copiar a base. Reinicie o Web App após transferir as contas. Sem a conta de visitante, o acesso permanece bloqueado.

O índice SQLite usa WAL e fica no disco local temporário `/tmp`, separado do armazenamento compartilhado. Ele pode ser reconstruído a partir dos relatórios e snapshots persistentes quando o contêiner for substituído; a indexação dos cargos pode levar tempo. Não configure `OFFICE_DB_PATH` em armazenamento de rede. Fora do contêiner, o padrão continua sendo `data/offices.sqlite`.

Valide a senha em janela anônima, o bloqueio de `/api/audits` sem sessão, o login administrativo separado e a preservação dos relatórios após reiniciar. Reinícios encerram sessões e podem exigir retomar a coleta pelo painel. Mantenha backup independente do armazenamento persistente. Não sirva `public` ou `data` diretamente por outro servidor, pois isso contornaria a barreira de acesso do Node.
