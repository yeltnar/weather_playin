import axios from "axios";
import config from "config";
import fs from 'fs/promises';

const DEFAULT_API_KEY = config.apikey;
const DEFAULT_LAT = config.lat;
const DEFAULT_LON = config.lon;

// const hr_formatter = new Intl.DateTimeFormat([], {hour12:false, hour:'numeric'});

(async()=>{

    let all_weather = (await getWeatherCached());
    let hourly_weather = all_weather.hourly;
    
    const hourly_weather_reduced = hourly_weather.reduce((acc,cur,i,arr)=>{

        const time = new Date(cur.dt*1000);
        const month = time.getMonth()+1; // Jan is 0
        const date = time.getDate();
        const year = time.getFullYear();

        let hr = time.getHours();

        const sunrise_time_obj = getSunRise({month,date,year}, all_weather);
        const sunset_time_obj = getSunSet({month,date,year}, all_weather);

        const sunrise_hr = sunrise_time_obj.getHours();
        const sunset_hr = sunset_time_obj.getHours();
        
        if(
            cur.wind_speed <= 15 && 
            hr >= sunrise_hr && 
            hr <= sunset_hr &&
            !/rain/i.test(JSON.stringify(cur.weather))
        ){
            acc.push({
                time:time.toString(),
                dt:cur.dt,
                temp:cur.temp,
                wind_speed:cur.wind_speed,
                wind_gust:cur.wind_gust,
                description:cur.weather[0].description,
                sunrise_hr,
                sunset_hr,
            });
        }
        
        return acc;
    },[]);
    
    console.log(`found ${hourly_weather_reduced.length} good hours`);
    console.log(hourly_weather_reduced);

})();

async function getWeatherCached(options={lat:DEFAULT_LAT,lon:DEFAULT_LON,appid:DEFAULT_API_KEY}){

    const dir = `.weather_requests`;
    const file_name = `${dir}/${options.lat}_${options.lon}`;

    let to_return;

    try{
        const file_contents = (await fs.readFile(file_name)).toString();
        to_return  = JSON.parse(file_contents);

        const first_ts = to_return.hourly[0].dt*1000;
        const cutoff_time = new Date().getTime() - (1000*60*60*5); // 5 hrs

        if( cutoff_time > first_ts  ){
            throw new Error("time too old");
        }
    }catch(e){
        console.log('Going to hit network')
        to_return = await getWeather(options);
        await fs.mkdir(dir,{recursive:true}).catch(()=>{}); // don't worry about it being there
        await fs.writeFile(file_name,JSON.stringify(to_return));
    }

    return to_return;
    throw new Error('not done')
}

async function getWeather({lat,lon,appid}={lat:DEFAULT_LAT,lon:DEFAULT_LON,appid:DEFAULT_API_KEY}){

    const options = {
        method: 'GET',
        url: 'https://api.openweathermap.org/data/2.5/onecall',
        params: {
            lat,
            lon,
            exclude: 'current,minutely,alerts',
            appid,
            units: 'imperial'
        }
    };
    
    const result = await axios.request(options).then(function (response) {
        return response.data
    }).catch(function (error) {
        console.error(error);
    });

    return result;
}

const getSunRise = (()=>{

    const cache_table = {};

    return function getSunRise(custom_date_obj, weather_obj){

        const cache_id = `${custom_date_obj.year}/${custom_date_obj.month}/${custom_date_obj.date}`;

        if( cache_table[cache_id] === undefined ){
            const x = getDaysObj(custom_date_obj, weather_obj);
            cache_table[cache_id] = new Date(x.sunrise*1000);    
        }
        
        return cache_table[cache_id];
    }    
})();

const getSunSet = (()=>{

    const cache_table = {};

    return function getSunSet(custom_date_obj, weather_obj){

        const cache_id = `${custom_date_obj.year}/${custom_date_obj.month}/${custom_date_obj.date}`;

        if( cache_table[cache_id] === undefined ){
            const x = getDaysObj(custom_date_obj, weather_obj);
            cache_table[cache_id] = new Date(x.sunset*1000);    
        }
        
        return cache_table[cache_id];
    }    
})();


const getDaysObj = (()=>{

    const date_cache_table = {};

    return function getDaysObj({month,date,year}, weather_obj){

        const cache_id = `${year}/${month}/${date}`;

        if( date_cache_table[cache_id] === undefined ){
            const date_obj = new Date(`${month}/${date}/${year} 13:00:00 GMT-0500`)
            const obj_dt = date_obj.getTime()/1000;
        
            date_cache_table[cache_id] = weather_obj.daily.reduce((acc,cur,i,arr)=>{
        
                if(acc===undefined && cur.dt===obj_dt ){
                    return cur;
                }
                return acc;
            },undefined);
        }

        return date_cache_table[cache_id];
    }
})();
