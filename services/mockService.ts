import { CarrierData, User, InsurancePolicy, BasicScore, OosRate, BlockedIP } from '../types';
import { fetchCarrierFromBackend, fetchSafetyFromBackend, fetchInsuranceFromBackend } from './backendService';

// === HELPER FUNCTIONS ===
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  // FIX: Added \n replacement to merge multi-line addresses (City/State/Zip) into one string
  return text.replace(/\u00a0/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
};

const cfDecodeEmail = (encoded: string): string => {
  try {
    let email = "";
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return "";
  }
};

const findValueByLabel = (doc: Document, label: string): string => {
  const ths = Array.from(doc.querySelectorAll('th'));
  const targetTh = ths.find(th => cleanText(th.textContent).includes(label));
  if (targetTh && targetTh.nextElementSibling) {
    // FIX 1: Cast to HTMLElement so Vercel build recognizes .innerText
    const nextTd = targetTh.nextElementSibling as HTMLElement;
    
    // FIX 2: Use .innerText instead of .childNodes[0] 
    // This grabs the text AFTER the <br> tag (the City, State, and Zip)
    const val = nextTd.innerText || nextTd.textContent;
    return cleanText(val);
  }
  return '';
};

// === NETWORK LAYER (FALLBACK) ===

const fetchUrl = async (targetUrl: string, useProxy: boolean): Promise<string | any | null> => {
  if (!useProxy) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        return contentType?.includes("application/json") ? await response.json() : await response.text();
      }
    } catch (error) { return null; }
  }

  const proxyGenerators = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (const generateProxyUrl of proxyGenerators) {
    try {
      const response = await fetch(generateProxyUrl(targetUrl));
      if (response.ok) {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    } catch (error) {}
  }
  return null;
};

// === SCRAPER LOGIC (NOW USES BACKEND) ===

export const fetchSafetyData = async (dot: string): Promise<{ 
  rating: string, 
  ratingDate: string, 
  basicScores: BasicScore[], 
  oosRates: OosRate[] 
}> => {
  // Try backend first
  const backendResult = await fetchSafetyFromBackend(dot);
  if (backendResult) {
    return backendResult;
  }

  // Fallback to old proxy method
  const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dot}/CompleteProfile.aspx`;
  const html = await fetchUrl(url, true);
  
  if (typeof html !== 'string') throw new Error("Could not fetch safety data");

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const ratingEl = doc.getElementById('Rating');
  const rating = ratingEl ? cleanText(ratingEl.textContent) : 'N/A';
  
  const ratingDateEl = doc.getElementById('RatingDate');
  const ratingDate = ratingDateEl 
    ? cleanText(ratingDateEl.textContent).replace('Rating Date:', '').replace('(', '').replace(')', '') 
    : 'N/A';

  const categories = ["Unsafe Driving", "Crash Indicator", "HOS Compliance", "Vehicle Maintenance", "Controlled Substances", "Hazmat Compliance", "Driver Fitness"];
  const basicScores: BasicScore[] = [];
  const sumDataRow = doc.querySelector('tr.sumData');
  
  if (sumDataRow) {
    const cells = Array.from(sumDataRow.querySelectorAll('td'));
    cells.forEach((cell, i) => {
      const valSpan = cell.querySelector('span.val');
      const val = valSpan ? cleanText(valSpan.textContent) : cleanText(cell.textContent);
      if (categories[i]) {
        basicScores.push({ category: categories[i], measure: val || '0.00' });
      }
    });
  }

  const oosRates: OosRate[] = [];
  const safetyDiv = doc.getElementById('SafetyRating');
  const oosTable = safetyDiv?.querySelector('table');
  if (oosTable) {
    const rows = Array.from(oosTable.querySelectorAll('tbody tr'));
    rows.forEach(row => {
      const cols = Array.from(row.querySelectorAll('th, td'));
      if (cols.length >= 3) {
        oosRates.push({
          type: cleanText(cols[0].textContent),
          rate: cleanText(cols[1].textContent),
          nationalAvg: cleanText(cols[2].textContent)
        });
      }
    });
  }

  return { rating, ratingDate, basicScores, oosRates };
};

const fetchCarrierEmailFromSMS = async (dotNumber: string, useProxy: boolean): Promise<string> => {
  if (!dotNumber || dotNumber === 'UNKNOWN' || dotNumber === '') return '';
  const smsUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/CarrierRegistration.aspx`;
  const result = await fetchUrl(smsUrl, useProxy);
  if (typeof result !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(result, 'text/html');
  const labels = doc.querySelectorAll('label');
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].textContent?.includes('Email:')) {
      const parent = labels[i].parentElement;
      if (parent) {
        const cfEmail = parent.querySelector('[data-cfemail]');
        if (cfEmail) return cfDecodeEmail(cfEmail.getAttribute('data-cfemail') || '');
        const text = cleanText(parent.textContent?.replace('Email:', ''));
        if (text && text.includes('@')) return text;
      }
    }
  }
  return '';
};

export const scrapeRealCarrier = async (mcNumber: string, useProxy: boolean): Promise<CarrierData | null> => {
  // Try backend first
  const backendResult = await fetchCarrierFromBackend(mcNumber);
  if (backendResult) {
    return backendResult;
  }

  // Fallback to old proxy method
  const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mcNumber}`;
  const html = await fetchUrl(url, useProxy);
  if (typeof html !== 'string') return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (!doc.querySelector('center')) return null;

  const getVal = (label: string) => findValueByLabel(doc, label);

  const findMarked = (summary: string) => {
    const table = doc.querySelector(`table[summary="${summary}"]`);
    if (!table) return [];
    const res: string[] = [];
    table.querySelectorAll('td').forEach(cell => {
      if (cell.textContent?.trim() === 'X') {
        const next = cell.nextElementSibling;
        if (next) res.push(cleanText(next.textContent));
      }
    });
    return res;
  };

  const carrier: CarrierData = {
    mcNumber,
    dotNumber: getVal('USDOT Number:'),
    legalName: getVal('Legal Name:'),
    dbaName: getVal('DBA Name:'),
    entityType: getVal('Entity Type:'),
    status: getVal('Operating Authority Status:'),
    email: '', 
    phone: getVal('Phone:'),
    powerUnits: getVal('Power Units:'),
    drivers: getVal('Drivers:'),
    physicalAddress: getVal('Physical Address:'),
    mailingAddress: getVal('Mailing Address:'),
    dateScraped: new Date().toLocaleDateString('en-US'),
    mcs150Date: getVal('MCS-150 Form Date:'),
    mcs150Mileage: getVal('MCS-150 Mileage (Year):'),
    operationClassification: findMarked("Operation Classification"),
    carrierOperation: findMarked("Carrier Operation"),
    cargoCarried: findMarked("Cargo Carried"),
    outOfServiceDate: getVal('Out of Service Date:'),
    stateCarrierId: getVal('State Carrier ID Number:'),
    dunsNumber: getVal('DUNS Number:')
  };

  if (carrier.dotNumber) {
    carrier.email = await fetchCarrierEmailFromSMS(carrier.dotNumber, useProxy);
  }

  return carrier;
};

// ... Rest of the code (InsuranceData, downloadCSV, Mock Data) stays identical ...
