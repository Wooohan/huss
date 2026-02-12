import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to clean text
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};

// Helper function to decode CloudFlare protected emails
const cfDecodeEmail = (encoded: string): string => {
  try {
    let email = '';
    const r = parseInt(encoded.substr(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substr(n, 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (e) {
    return '';
  }
};

// Route 1: Scrape Carrier Data from SAFER
app.get('/api/scrape/carrier/:mcNumber', async (req: Request, res: Response) => {
  const { mcNumber } = req.params;
  const { useProxy } = req.query;

  try {
    const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${mcNumber}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    // Check if carrier exists
    if (!$('center').length) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Helper to find value by label
    const findValueByLabel = (label: string): string => {
      let value = '';
      $('th').each((_, el) => {
        const thText = cleanText($(el).text());
        if (thText.includes(label)) {
          const nextTd = $(el).next('td');
          value = cleanText(nextTd.text());
          return false; // break
        }
      });
      return value;
    };

    // Helper to find marked checkboxes
    const findMarked = (summary: string): string[] => {
      const results: string[] = [];
      $(`table[summary="${summary}"]`).find('td').each((_, el) => {
        if (cleanText($(el).text()) === 'X') {
          const next = $(el).next();
          if (next.length) {
            results.push(cleanText(next.text()));
          }
        }
      });
      return results;
    };

    const carrierData = {
      mcNumber,
      dotNumber: findValueByLabel('USDOT Number:'),
      legalName: findValueByLabel('Legal Name:'),
      dbaName: findValueByLabel('DBA Name:'),
      entityType: findValueByLabel('Entity Type:'),
      status: findValueByLabel('Operating Authority Status:'),
      phone: findValueByLabel('Phone:'),
      powerUnits: findValueByLabel('Power Units:'),
      drivers: findValueByLabel('Drivers:'),
      physicalAddress: findValueByLabel('Physical Address:'),
      mailingAddress: findValueByLabel('Mailing Address:'),
      dateScraped: new Date().toLocaleDateString('en-US'),
      mcs150Date: findValueByLabel('MCS-150 Form Date:'),
      mcs150Mileage: findValueByLabel('MCS-150 Mileage (Year):'),
      operationClassification: findMarked('Operation Classification'),
      carrierOperation: findMarked('Carrier Operation'),
      cargoCarried: findMarked('Cargo Carried'),
      outOfServiceDate: findValueByLabel('Out of Service Date:'),
      stateCarrierId: findValueByLabel('State Carrier ID Number:'),
      dunsNumber: findValueByLabel('DUNS Number:'),
      email: '',
    };

    // Fetch email if DOT number exists
    if (carrierData.dotNumber) {
      try {
        const emailUrl = `https://ai.fmcsa.dot.gov/SMS/Carrier/${carrierData.dotNumber}/CarrierRegistration.aspx`;
        const emailResponse = await axios.get(emailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        });

        const $email = cheerio.load(emailResponse.data);
        $email('label').each((_, el) => {
          if ($email(el).text().includes('Email:')) {
            const parent = $email(el).parent();
            const cfEmail = parent.find('[data-cfemail]');
            if (cfEmail.length) {
              carrierData.email = cfDecodeEmail(cfEmail.attr('data-cfemail') || '');
            } else {
              const text = cleanText(parent.text().replace('Email:', ''));
              if (text && text.includes('@')) {
                carrierData.email = text;
              }
            }
            return false;
          }
        });
      } catch (emailError) {
        console.error('Email fetch error:', emailError);
      }
    }

    res.json(carrierData);
  } catch (error: any) {
    console.error('Carrier scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape carrier data', details: error.message });
  }
});

// Route 2: Scrape Safety Data from FMCSA SMS
app.get('/api/scrape/safety/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dotNumber}/CompleteProfile.aspx`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // 1. Safety Rating
    const ratingEl = $('#Rating');
    const rating = ratingEl.length ? cleanText(ratingEl.text()) : 'N/A';
    
    const ratingDateEl = $('#RatingDate');
    let ratingDate = 'N/A';
    if (ratingDateEl.length) {
      ratingDate = cleanText(ratingDateEl.text())
        .replace('Rating Date:', '')
        .replace('(', '')
        .replace(')', '')
        .trim();
    }

    // 2. BASIC Scores
    const categories = [
      'Unsafe Driving',
      'Crash Indicator',
      'HOS Compliance',
      'Vehicle Maintenance',
      'Controlled Substances',
      'Hazmat Compliance',
      'Driver Fitness'
    ];
    
    const basicScores: Array<{ category: string; measure: string }> = [];
    const sumDataRow = $('tr.sumData');
    
    if (sumDataRow.length) {
      sumDataRow.find('td').each((i, el) => {
        const valSpan = $(el).find('span.val');
        const val = valSpan.length ? cleanText(valSpan.text()) : cleanText($(el).text());
        if (categories[i]) {
          basicScores.push({
            category: categories[i],
            measure: val || '0'
          });
        }
      });
    }

    // 3. Out of Service Rates
    const oosRates: Array<{ type: string; rate: string; nationalAvg: string }> = [];
    const safetyDiv = $('#SafetyRating');
    
    if (safetyDiv.length) {
      const oosTable = safetyDiv.find('table').first();
      if (oosTable.length) {
        oosTable.find('tbody tr').each((_, row) => {
          const cols = $(row).find('th, td');
          if (cols.length >= 3) {
            oosRates.push({
              type: cleanText($(cols[0]).text()),
              rate: cleanText($(cols[1]).text()),
              nationalAvg: cleanText($(cols[2]).text())
            });
          }
        });
      }
    }

    res.json({
      rating,
      ratingDate,
      basicScores,
      oosRates
    });
  } catch (error: any) {
    console.error('Safety scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape safety data', details: error.message });
  }
});

// Route 3: Scrape Insurance Data
app.get('/api/scrape/insurance/:dotNumber', async (req: Request, res: Response) => {
  const { dotNumber } = req.params;

  try {
    const url = `https://searchcarriers.com/company/${dotNumber}/insurances`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const rawData = response.data?.data || (Array.isArray(response.data) ? response.data : []);
    const policies: any[] = [];

    if (Array.isArray(rawData)) {
      rawData.forEach((p: any) => {
        const carrier = p.name_company || p.insurance_company || p.insurance_company_name || p.company_name || 'NOT SPECIFIED';
        const policyNumber = p.policy_no || p.policy_number || p.pol_num || 'N/A';
        const effectiveDate = p.effective_date ? p.effective_date.split(' ')[0] : 'N/A';

        let coverage = p.max_cov_amount || p.coverage_to || p.coverage_amount || 'N/A';
        if (coverage !== 'N/A' && !isNaN(Number(coverage))) {
          const num = Number(coverage);
          if (num < 10000 && num > 0) {
            coverage = `$${(num * 1000).toLocaleString()}`;
          } else {
            coverage = `$${num.toLocaleString()}`;
          }
        }

        let type = (p.ins_type_code || 'N/A').toString();
        if (type === '1') type = 'BI&PD';
        else if (type === '2') type = 'CARGO';
        else if (type === '3') type = 'BOND';

        let iClass = (p.ins_class_code || 'N/A').toString().toUpperCase();
        if (iClass === 'P') iClass = 'PRIMARY';
        else if (iClass === 'E') iClass = 'EXCESS';

        policies.push({
          dot: dotNumber,
          carrier: carrier.toString().toUpperCase(),
          policyNumber: policyNumber.toString().toUpperCase(),
          effectiveDate,
          coverageAmount: coverage.toString(),
          type: type.toUpperCase(),
          class: iClass
        });
      });
    }

    res.json({ policies, raw: response.data });
  } catch (error: any) {
    console.error('Insurance scrape error:', error.message);
    res.status(500).json({ error: 'Failed to scrape insurance data', details: error.message });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FMCSA Scraper Backend is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend proxy server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   - GET /api/scrape/carrier/:mcNumber`);
  console.log(`   - GET /api/scrape/safety/:dotNumber`);
  console.log(`   - GET /api/scrape/insurance/:dotNumber`);
});