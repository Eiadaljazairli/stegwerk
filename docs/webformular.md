# Webformular

Mehr → **Webformular**: Überschrift, Einleitung, Dankestext und die Adresse
der eigenen Datenschutzerklärung eintragen, speichern. Darunter steht der
Schnipsel zum Einbinden:

```html
<iframe src="https://<ihre-stegwerk-adresse>/formular/<id>" title="Kontakt aufnehmen"
  style="width:100%;max-width:640px;height:640px;border:0" loading="lazy"></iframe>
```

## Was eine Anfrage anlegt

- einen Kontakt (eine bekannte E-Mail-Adresse legt keinen zweiten an),
- eine Firma, wenn eine angegeben ist (ein bekannter Name keine zweite),
- eine Notiz mit der Nachricht,
- eine Aufgabe „Anfrage beantworten“ für den, der das Formular eingerichtet hat, fällig heute,
- auf Wunsch ein Geschäft in der ersten Phase,

dazu eine Mail an diese Person und die Webhooks `contact.created`,
`company.created`, `deal.created` mit `source: "webform"`.

## Schutz

- Einwilligung ist Pflicht; ohne Haken nimmt der Server nichts an.
- Ein unsichtbares Feld fängt Programme ab; sie bekommen dieselbe Antwort wie ein Mensch.
- Vor dem Absenden rechnet der Browser eine kleine Aufgabe (Arbeitsnachweis,
  etwa eine Sekunde, im Hintergrund). Die Aufgabe kommt von
  `GET /public/nachweis`, die Lösung geht in der Kopfzeile
  `X-Arbeitsnachweis` mit und gilt genau einmal, höchstens zehn Minuten.
  Ohne gültige Lösung antwortet der Server mit 400. Es gibt kein
  Bilderrätsel und keinen fremden Dienst.
- Wer schneller als drei Sekunden nach dem Öffnen abschickt, ist kein Mensch:
  die Anfrage wird still verworfen, die Antwort ist dieselbe wie bei Erfolg.
- Registrierung und „Passwort vergessen“ verlangen denselben Arbeitsnachweis.
- Fünf Absendungen je Minute und Adresse.
- Nur `/formular/…` darf in fremde Seiten eingebettet werden
  (`frame-ancestors https:`); jede andere Seite bleibt `DENY`.
- „Formular nimmt Anfragen an“ abwählen schaltet es sofort ab; der Link
  antwortet dann mit 404.
