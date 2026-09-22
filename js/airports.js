// Display names in the gate-screen style ("Sacramento, CA"). Unknown codes fall back to the API's city name.
window.FIDS = window.FIDS || {};

FIDS.AIRPORTS = {
  // US
  ABQ: 'Albuquerque, NM', ALB: 'Albany, NY', ANC: 'Anchorage, AK', ASE: 'Aspen, CO', ATL: 'Atlanta, GA',
  AUS: 'Austin, TX', BDL: 'Hartford, CT', BNA: 'Nashville, TN', BOI: 'Boise, ID', BOS: 'Boston, MA',
  BTV: 'Burlington, VT', BUF: 'Buffalo, NY', BWI: 'Baltimore, MD', BZN: 'Bozeman, MT', CHS: 'Charleston, SC',
  CLE: 'Cleveland, OH', CLT: 'Charlotte, NC', CMH: 'Columbus, OH', COS: 'Colorado Springs, CO', CVG: 'Cincinnati, OH',
  DCA: 'Washington, DC', DEN: 'Denver, CO', DFW: 'Dallas/Fort Worth, TX', DSM: 'Des Moines, IA', DTW: 'Detroit, MI',
  EGE: 'Vail/Eagle, CO', ELP: 'El Paso, TX', EUG: 'Eugene, OR', EWR: 'New York/Newark, NJ', FAT: 'Fresno, CA',
  FLL: 'Fort Lauderdale, FL', GEG: 'Spokane, WA', GRR: 'Grand Rapids, MI', GSP: 'Greenville/Spartanburg, SC',
  GUM: 'Guam', HDN: 'Steamboat Springs, CO', HNL: 'Honolulu, HI', IAD: 'Washington, DC', IAH: 'Houston, TX',
  ICT: 'Wichita, KS', IND: 'Indianapolis, IN', JAC: 'Jackson Hole, WY', JAX: 'Jacksonville, FL',
  JFK: 'New York/JFK, NY', KOA: 'Kona, HI', LAS: 'Las Vegas, NV', LAX: 'Los Angeles, CA', LGA: 'New York/LaGuardia, NY',
  LIH: 'Lihue, HI', LIT: 'Little Rock, AR', MCI: 'Kansas City, MO', MCO: 'Orlando, FL', MDW: 'Chicago/Midway, IL',
  MEM: 'Memphis, TN', MIA: 'Miami, FL', MKE: 'Milwaukee, WI', MRY: 'Monterey, CA', MSN: 'Madison, WI',
  MSO: 'Missoula, MT', MSP: 'Minneapolis, MN', MSY: 'New Orleans, LA', OGG: 'Kahului, HI', OKC: 'Oklahoma City, OK',
  OMA: 'Omaha, NE', ONT: 'Ontario, CA', ORD: 'Chicago', ORF: 'Norfolk, VA', PBI: 'West Palm Beach, FL',
  PDX: 'Portland, OR', PHL: 'Philadelphia, PA', PHX: 'Phoenix, AZ', PIT: 'Pittsburgh, PA', PSP: 'Palm Springs, CA',
  PVD: 'Providence, RI', PWM: 'Portland, ME', RDU: 'Raleigh/Durham, NC', RIC: 'Richmond, VA', RNO: 'Reno, NV',
  ROC: 'Rochester, NY', RSW: 'Fort Myers, FL', SAN: 'San Diego, CA', SAT: 'San Antonio, TX', SAV: 'Savannah, GA',
  SBA: 'Santa Barbara, CA', SBP: 'San Luis Obispo, CA', SEA: 'Seattle, WA', SJC: 'San Jose, CA', SJU: 'San Juan, PR',
  SLC: 'Salt Lake City, UT', SMF: 'Sacramento, CA', SNA: 'Orange County, CA', SRQ: 'Sarasota, FL', STL: 'St. Louis, MO',
  SYR: 'Syracuse, NY', TPA: 'Tampa/St Petersburg', TUL: 'Tulsa, OK', TUS: 'Tucson, AZ', XNA: 'Northwest Arkansas, AR',
  SFO: 'San Francisco, CA',
  // International
  AKL: 'Auckland', AMS: 'Amsterdam', ATH: 'Athens', BCN: 'Barcelona', BNE: 'Brisbane', BOG: 'Bogota',
  BOM: 'Mumbai', BRU: 'Brussels', CDG: 'Paris', CPH: 'Copenhagen', CUN: 'Cancun, Mexico', DEL: 'Delhi',
  DUB: 'Dublin', DXB: 'Dubai', EDI: 'Edinburgh', EZE: 'Buenos Aires', FCO: 'Rome', FRA: 'Frankfurt',
  GRU: 'Sao Paulo', GUA: 'Guatemala City', GVA: 'Geneva', HKG: 'Hong Kong', HND: 'Tokyo Haneda', ICN: 'Seoul',
  LHR: 'London Heathrow', LIM: 'Lima', LIR: 'Liberia, Costa Rica', LIS: 'Lisbon', MAD: 'Madrid',
  MBJ: 'Montego Bay, Jamaica', MEL: 'Melbourne', MEX: 'Mexico City', MNL: 'Manila', MUC: 'Munich',
  NAN: 'Nadi, Fiji', NAS: 'Nassau, Bahamas', NRT: 'Tokyo Narita', PPT: 'Papeete, Tahiti', PTY: 'Panama City',
  PUJ: 'Punta Cana, DR', PVG: 'Shanghai', PVR: 'Puerto Vallarta, Mexico', SIN: 'Singapore', SJD: 'Los Cabos, Mexico',
  SJO: 'San Jose, Costa Rica', SYD: 'Sydney', TLV: 'Tel Aviv', TPE: 'Taipei', YUL: 'Montreal, QC',
  YVR: 'Vancouver, BC', YYZ: 'Toronto, ON', ZRH: 'Zurich',
};

// "Sacramento, CA (SMF)"
FIDS.airportLabel = function (code, fallbackCity) {
  const c = (code || '').toUpperCase();
  const name = FIDS.AIRPORTS[c] || fallbackCity || c;
  return c ? name + ' (' + c + ')' : name;
};
