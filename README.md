# Studielog

Een eenvoudig Nederlands studiedagboek. Voeg meerdere items per dag toe, kies **sessie** of **les**, vul de minuten in en bekijk je geschiedenis per dag. Met **Bewerken** pas je later de datum, soort, beschrijving en minuten aan. Werkt op mobiel en desktop.

Bovenaan toont een ringdiagram alle gemaakte uren tegenover een zelf instelbaar urendoel. Maak doelen met een naam en een aantal uren en bekijk maximaal drie doelen naast elkaar; overige doelen staan achter een uitklapper. **Wijzigen** past naam en uren aan. **Archiveren** bewaart het doel en de gemaakte uren op dat moment in het archief. **Terugzetten** maakt een gearchiveerd doel weer actief. **Verwijderen** vraagt bevestiging en haalt alleen het doel uit de interface. Studie-items blijven altijd behouden. Verwijderde doelen krijgen in de Sheet de status `verwijderd` en kunnen daar zo nodig worden hersteld.

Doelen staan in het tabblad `Doelen`, met kolommen ID, Naam, Doeluren, Status, Aangemaakt, Bijgewerkt, Gearchiveerd op, Uren bij archiveren, Startdatum en Deadline. Het oorspronkelijke doel uit `Instellingen!B2` is eenmalig overgenomen als ‘Mijn urendoel’. De oude instelling blijft bewaard voor de eerdere websiteversie, maar wordt door de nieuwe interface niet gebruikt.

De uren worden berekend uit de minuten van alle lessen en sessies, onafhankelijk van het gekozen filter. Zonder startdatum gebruikt elk actief doel hetzelfde totaal aan gemaakte uren tot en met vandaag. Met een startdatum tellen alleen uren vanaf die datum mee. Zonder actief doel blijft de ring leeg. Bij het overschrijden van het doel blijft de ring volledig gevuld en toont de tekst het werkelijke percentage.

## Website

https://emmahl98.github.io/studielog/

De site is statisch en wordt gepubliceerd met GitHub Pages vanaf `main`, map `/ (root)`. Er zijn geen npm-pakketten of betaalde servers nodig.

## Eenmalige Google-instelling

1. Maak in [Google Cloud Console](https://console.cloud.google.com/) een project en schakel de **Google Sheets API** in. Facturering is niet nodig.
2. Stel **Google Auth Platform** in met een appnaam en je eigen e-mailadres. Gebruik bij een persoonlijk account **External** en voeg je eigen Google-account toe als testgebruiker onder **Audience**.
3. Maak onder **Clients** een OAuth-client met type **Web application**.
4. Voeg als **Authorized JavaScript origin** `https://emmahl98.github.io` toe. Dit is alleen het domein, zonder `/studielog/`.
5. Open de website, klik **Instellingen**, plak de **client-ID** (eindigt op `.apps.googleusercontent.com`) en sla op. Gebruik geen client secret.
6. Klik **Verbinden met Google** en geef toestemming voor Google Sheets.

Je kunt de openbare client-ID ook in `config.js` invullen om hem op al je apparaten beschikbaar te maken. De instelling op de website wordt alleen in de huidige browser onthouden.

Google OAuth in testmodus kan opnieuw toestemming vragen. Alleen ingestelde testgebruikers kunnen verbinden. De site vraagt de Sheets-scope: Google verleent daarmee toegang tot spreadsheets die het ingelogde account mag openen; deze app benadert alleen het spreadsheet uit `config.js`. Wijzig of verleen deze toestemming zelf in Google. Je spreadsheet blijft privé. De GitHub-verbinding van Codex is geen Google-inlogsessie voor de website.

## Spreadsheet

De bestaande spreadsheet is de database. Laat de tabnaam `Sheet1` en onderstaande kolommen staan:

| Datum | Label | Onderwerp | ID | Aangemaakt | Naam | Minuten | Uren |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `YYYY-MM-DD` | `sessie` of `les` | Vrije tekst | Unieke item-ID | ISO-tijdstip | Oorspronkelijke naam | Geheel aantal groter dan 0 | Minuten / 60, afgerond op 1 decimaal |

Elke rij is één studie-item. Meerdere rijen mogen dezelfde datum hebben. De website sorteert nieuwste dagen en items eerst. De app schrijft met `RAW`, zodat tekst geen formule wordt. Handmatig toegevoegde rijen moeten de bovenstaande notatie volgen. ID en Aangemaakt mogen voor handmatige items leeg zijn.

Het kortlevende Google-toegangstoken wordt in `sessionStorage` van het huidige tabblad bewaard, zodat verversen je verbinding herstelt zolang het token geldig is (meestal ongeveer een uur). De geldigheid wordt niet verlengd. Bij uitloggen wordt het token gewist; bij verlopen toegang moet je opnieuw verbinden. Opslag kan door browserinstellingen worden geblokkeerd; in dat geval werkt aanmelden alleen in het geheugen. Er staan geen wachtwoorden, tokens of clientsleutels in de repository. Uitloggen wist de geladen items uit de pagina. Invoer wordt alleen na bevestiging door de Sheets API als opgeslagen getoond; bij fouten blijft de tekst in het formulier. Een stabiele item-ID voorkomt dubbele rijen bij opnieuw proberen na een onzekere netwerkreactie, zolang de pagina open blijft. Controleer na het herladen eerst je overzicht als een eerdere opslag onduidelijk was.

## Ontwikkelen en controleren

Open de site via een lokale HTTP-server; OAuth werkt niet via `file://`. Voeg een lokale origin aan de OAuth-client toe wanneer je lokaal wilt inloggen.

`npm test` voert tests uit voor datums, meerdere items per dag, filteren, letterlijk opslaan, opnieuw proberen en foutafhandeling. Geen installatie van dependencies nodig.

Bij bewerken zoekt de app opnieuw het item-ID op en schrijft alleen Datum, Label, Onderwerp, Minuten en Uren. De oorspronkelijke Notion-velden, het ID en het aanmaaktijdstip blijven behouden. Bewerk de Sheet niet tegelijkertijd met opslaan op de website. Items zonder ID kunnen alleen in de Sheet worden aangepast. Verwijderen gaat rechtstreeks via Google Sheets. Vernieuw daarna het overzicht.

## Studienotities

De tab Studienotities biedt korte notities met een optionele titel, aanklikbare webadressen en zoeken op titel of inhoud. Notities zijn te wijzigen, archiveren, terugzetten en verwijderen. Ze staan apart in Studienotities (ID, Titel, Notitie, Status, Aangemaakt, Bijgewerkt). Verwijderen geeft de status verwijderd; de rij blijft in de Sheet bewaard.

Doelen hebben optionele Startdatum en Deadline (kolommen I en J, YYYY-MM-DD). Vanaf de startdatum staat het doel Live; tot die dag wordt de startdatum getoond. Alleen uren vanaf de startdatum tot en met vandaag tellen mee; zonder startdatum alle uren tot vandaag. Bij een deadline toont de kaart resterende uren gedeeld door kalenderdagen vanaf vandaag (of een toekomstige startdatum), inclusief de deadline. Na de deadline verschijnt Deadline verstreken. Zonder deadline is er geen dagtempo.
