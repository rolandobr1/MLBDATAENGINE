import angels from '../MLB_LOGOS/4389_los_angeles_angels-primary-2016.png';
import astros from '../MLB_LOGOS/houston_astros_logo_primary_20137038.png';
import athletics from '../MLB_LOGOS/athletics__logo_primary_2025_sportslogosnet-5001.png';
import bluejays from '../MLB_LOGOS/toronto_blue_jays_logo_primary_20208446.png';
import braves from '../MLB_LOGOS/atlanta_braves_logo_primary_20221869.png';
import brewers from '../MLB_LOGOS/6474_milwaukee_brewers-primary-2020.png';
import cardinals from '../MLB_LOGOS/3zhma0aeq17tktge1huh7yok5.png';
import cubs from '../MLB_LOGOS/chicago_cubs_logo_primary_19792956.png';
import diamondbacks from '../MLB_LOGOS/arizona_diamondbacks_logo_primary_2024_sportslogosnet-3125.png';
import dodgers from '../MLB_LOGOS/los_angeles_dodgers_logo_primary_20127886.png';
import giants from '../MLB_LOGOS/san_francisco_giants_logo_primary_20002208.png';
import guardians from '../MLB_LOGOS/cleveland_guardians_logo_primary_20227577.png';
import mariners from '../MLB_LOGOS/seattle_mariners_logo_primary_19933809.png';
import marlins from '../MLB_LOGOS/miami_marlins_logo_primary_20194007.png';
import mets from '../MLB_LOGOS/new_york_mets_logo_primary_1999sportslogosnet8711.png';
import nationals from '../MLB_LOGOS/washington_nationals_logo_primary_20117280.png';
import orioles from '../MLB_LOGOS/baltimore_orioles_logo_primary_20195398.png';
import padres from '../MLB_LOGOS/san-diego-padres-logo-primary-2020-3955.png';
import phillies from '../MLB_LOGOS/philadelphia_phillies_logo_primary_20193931.png';
import pirates from '../MLB_LOGOS/1250_pittsburgh_pirates-primary-2014.png';
import rangers from '../MLB_LOGOS/texas_rangers_logo_primary_2024_sportslogosnet-5505.png';
import rays from '../MLB_LOGOS/tampa_bay_rays_logo_primary_20196768.png';
import reds from '../MLB_LOGOS/cincinnati_reds_logo_primary_20133208.png';
import redsox from '../MLB_LOGOS/boston_red_sox_logo_primary_20097510.png';
import rockies from '../MLB_LOGOS/colorado_rockies_logo_primary_20171892.png';
import royals from '../MLB_LOGOS/kansas-city-royals-logo-primary-2026-6254262026.png';
import tigers from '../MLB_LOGOS/detroit_tigers_logo_primary_20162109.png';
import twins from '../MLB_LOGOS/minnesota_twins_logo_primary_2023_sportslogosnet-3953.png';
import whitesox from '../MLB_LOGOS/chicago_white_sox_logo_primary_19911413.png';
import yankees from '../MLB_LOGOS/new_york_yankees_logo_primary_19685115.png';

export function getTeamLogo(teamName: string | undefined | null): string | null {
  if (!teamName) return null;
  const name = teamName.toLowerCase().trim();
  
  if (name.includes('angels')) return angels;
  if (name.includes('astros')) return astros;
  if (name.includes('athletics')) return athletics;
  if (name.includes('blue jays') || name.includes('bluejays')) return bluejays;
  if (name.includes('braves')) return braves;
  if (name.includes('brewers')) return brewers;
  if (name.includes('cardinals')) return cardinals;
  if (name.includes('cubs')) return cubs;
  if (name.includes('diamondbacks') || name.includes('d-backs')) return diamondbacks;
  if (name.includes('dodgers')) return dodgers;
  if (name.includes('giants')) return giants;
  if (name.includes('guardians')) return guardians;
  if (name.includes('mariners')) return mariners;
  if (name.includes('marlins')) return marlins;
  if (name.includes('mets')) return mets;
  if (name.includes('nationals')) return nationals;
  if (name.includes('orioles')) return orioles;
  if (name.includes('padres')) return padres;
  if (name.includes('phillies')) return phillies;
  if (name.includes('pirates')) return pirates;
  if (name.includes('rangers')) return rangers;
  if (name.includes('rays')) return rays;
  if (name.includes('reds')) return reds;
  if (name.includes('red sox') || name.includes('redsox')) return redsox;
  if (name.includes('rockies')) return rockies;
  if (name.includes('royals')) return royals;
  if (name.includes('tigers')) return tigers;
  if (name.includes('twins')) return twins;
  if (name.includes('white sox') || name.includes('whitesox')) return whitesox;
  if (name.includes('yankees')) return yankees;
  
  return null;
}

export function getTeamColor(teamName: string | undefined | null): string {
  if (!teamName) return '#1e293b'; // slate-800
  const name = teamName.toLowerCase().trim();
  
  if (name.includes('angels')) return '#ba0021';
  if (name.includes('astros')) return '#eb6e1f';
  if (name.includes('athletics')) return '#003831';
  if (name.includes('blue jays') || name.includes('bluejays')) return '#134a8e';
  if (name.includes('braves')) return '#ce1141';
  if (name.includes('brewers')) return '#12284b'; // azul marino oficial — el dorado (#ffc52f) no tiene contraste suficiente con texto blanco
  if (name.includes('cardinals')) return '#c41e3a';
  if (name.includes('cubs')) return '#0e3386';
  if (name.includes('diamondbacks') || name.includes('d-backs')) return '#a71930';
  if (name.includes('dodgers')) return '#005a9c';
  if (name.includes('giants')) return '#fd5a1e';
  if (name.includes('guardians')) return '#e31937';
  if (name.includes('mariners')) return '#0c2c56';
  if (name.includes('marlins')) return '#00a3e0';
  if (name.includes('mets')) return '#ff5910';
  if (name.includes('nationals')) return '#ab0003';
  if (name.includes('orioles')) return '#df4601';
  if (name.includes('padres')) return '#2f241d';
  if (name.includes('phillies')) return '#e81828';
  if (name.includes('pirates')) return '#27251f'; // negro oficial — el dorado (#fdb827) no tiene contraste suficiente con texto blanco
  if (name.includes('rangers')) return '#003278';
  if (name.includes('rays')) return '#092c5c';
  if (name.includes('reds')) return '#c6011f';
  if (name.includes('red sox') || name.includes('redsox')) return '#bd3039';
  if (name.includes('rockies')) return '#33006f';
  if (name.includes('royals')) return '#004687';
  if (name.includes('tigers')) return '#0c2340';
  if (name.includes('twins')) return '#002b5c';
  if (name.includes('white sox') || name.includes('whitesox')) return '#27251f';
  if (name.includes('yankees')) return '#003087';
  
  return '#1e293b';
}

export function getTeamAbbr(teamName: string | undefined | null): string {
  if (!teamName) return 'UNK';
  const name = teamName.trim();
  const map: Record<string, string> = {
    "Arizona Diamondbacks": "ARI",
    "Atlanta Braves": "ATL",
    "Baltimore Orioles": "BAL",
    "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC",
    "Chicago White Sox": "CWS",
    "Cincinnati Reds": "CIN",
    "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL",
    "Detroit Tigers": "DET",
    "Houston Astros": "HOU",
    "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA",
    "Los Angeles Dodgers": "LAD",
    "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN",
    "New York Mets": "NYM",
    "New York Yankees": "NYY",
    "Oakland Athletics": "OAK",
    "Philadelphia Phillies": "PHI",
    "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SD",
    "San Francisco Giants": "SF",
    "Seattle Mariners": "SEA",
    "St. Louis Cardinals": "STL",
    "Tampa Bay Rays": "TB",
    "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR",
    "Washington Nationals": "WSH"
  };
  return map[name] || name.substring(0, 3).toUpperCase();
}

