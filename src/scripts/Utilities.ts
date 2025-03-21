





export const utf8_to_b64 = (str : string) => window.btoa(encodeURIComponent(str));

export const clamp = (num : number, min : number, max : number) => Math.min(Math.max(num, min), max);


// export const fetchGlobalPosition = (component : PIXI.Sprite | PIXI.Texture) => {
//     let point = new PIXI.Point();
    
//     component.getGlobalPosition(point, false);
//     return point;
// };


export const lerp = (oldValue : number, newValue : number, weight : number, dt : number) => oldValue + (oldValue * (1 - weight) + newValue * weight - oldValue) * dt /50;







