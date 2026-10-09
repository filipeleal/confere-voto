# Especificação oficial TSE 2026

Obtida em 05/10/2026 no link “Formato dos arquivos de BU, RDV e assinatura digital” da página https://www.tse.jus.br/eleicoes/eleicoes-2026.

Download: https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/formato-arquivos-de-bu-rdv-e-assinatura-digital

SHA-256 do ZIP: b5ac413e81121d53de2bb1657af611f84a45fdc84388e9d9821872994bbfbafd

SHA-256 de `spec/spec/bu.asn1`: ef64bf723f774403b423ed0b617f5a83a3f50c0023d0003e18cd29170404ab81

O decodificador usa `asn1tools`, BER e enums numéricos, seguindo o exemplo `python/bu_dump.py` do pacote oficial. O esquema é mantido sem alterações. Os demais exemplos do pacote não são executados pela aplicação.
