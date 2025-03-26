import { Graphics } from "pixi.js";


export enum HGraphicType {
    CIRCLE
}

export class HGraphic extends Graphics {

    constructor(public typeOfGraphic: HGraphicType, public gColor: number, public gDimensions: any, public gAlpha: number = 1) {
        super();

        this.resize();

    }


    resize() {
        this.clear();

        this.beginFill(this.gColor, this.gAlpha);

        if (this.typeOfGraphic == HGraphicType.CIRCLE) {
            this.drawCircle(0, 0, this.gDimensions.radius);
        }

        this.endFill();
    }
}