import * as PIXI from 'pixi.js';
import { fetchGlobalPosition, getDirectionBetween, getMagnitude, normalize } from '../Utilities';


export const Transition = (to, condition) => {
    return {
        To : to,
        Condition : condition        
    }
}

export class States
{
    constructor(entity)
    {
       this.entity = entity; 
       this.transitions = []; 
    }



    addTransition(to, condition)
    {
        const transition = {
            To : to,
            Condition : condition
        };

        this.transitions.push(transition);
    }
}

export class CollectState extends States
{
    constructor(entity)
    {
        super(entity);

        this.targetCollectible = null;
        this.lastTimeout = null;
    }

    
    onEnter()
    {
        this.entity.changeDirection(this.getDirection);

        this.setRandomTimeout();

        const randomTime = (Math.random() * 2000) + 3000;

        this.boostTime = setTimeout(() => {
            if(Math.random() > 0.8)
            {
                this.entity.isInBoostedMode = true;

                this.boostTime = setTimeout(() => {
                    this.entity.isInBoostedMode = false;

                }, randomTime);
            }
        }, randomTime);
    }

    setRandomTimeout()
    {
        const randomValue = ((Math.random() * 2) + 1) * 1000;

        this.lastTimeout = setTimeout(() => {
            this.entity.changeDirection(this.getDirection, 1000);

            this.setRandomTimeout();
        }, randomValue);
    }

    onUpdate(dt)
    {
        // console.log("IN COLLECT");
        let dir = this.entity.isFacingTowardsBounds;

        if(dir != null && !this.entity.isTurning)
        { 
           dir = normalize(dir); 
          //  console.log("IS OUT", dir);
            clearTimeout(this.lastTimeout);
            this.entity.changeDirection(dir, 200);
            this.setRandomTimeout();
        }
    }

    onExit()
    {
        clearTimeout(this.lastTimeout);
        clearTimeout(this.boostTime);
        this.entity.isInBoostedMode = false;
        this.entity.changeDirection(new PIXI.Point(0, 0), 100);
        
    }

    get getDirection()
    {
        if(this.entity.collectiblesInSight.length > 0)
        {
            const cPos = new PIXI.Point(this.entity.collectiblesInSight[0].position[0], this.entity.collectiblesInSight[0].position[1]);
            const ePos = fetchGlobalPosition(this.entity);

            const dir = getDirectionBetween(ePos, cPos);

            return normalize(dir);
            
        }

        return new PIXI.Point((Math.random() * 2) - 1, (Math.random() * 2) - 1);
    }



}

export class AttackState extends States
{
    constructor(entity)
    {
        super(entity);
    }

    
    onEnter()
    {
        // console.log("STATE Changed " + this.entity.uuid);
        this.entity.noOfAttempts = 0;

        const randomTime = (Math.random() * 2000) + 3000;

        this.lastTimeout = setTimeout(() => {
            if(Math.random() > 0.8)
            {
                this.entity.isInBoostedMode = true;
            }
        }, randomTime);
    }

    onExit()
    {
        clearTimeout(this.lastTimeout);
        this.entity.isInBoostedMode = false;
    }

    onUpdate(dt)
    {
        if(!this.entity.isTurning)
            this.entity.changeDirection(this.getDirection, 150);
            
        this.entity.swingSword();
    }

    

    get getDirection()
    {

        
        const ownPos = new PIXI.Point(this.entity.body.position[0], this.entity.body.position[1]);
        const targetPos = new PIXI.Point(this.entity.followTarget.body.position[0], this.entity.followTarget.body.position[1]);

        const direction = getDirectionBetween(ownPos, targetPos);

        if(getMagnitude(direction) > this.entity.followTargetDistance)
        {
            this.entity.followTarget = null;
        } else if (getMagnitude(direction) <= this.entity.swingSwordRange)
        {
            this.entity.readyToSwing = true;
            return new PIXI.Point();
        } 
        

        return normalize(direction);
    }
}

export class EscapeState extends States
{
    constructor(entity)
    {
        super(entity);
    }
      
    onEnter()
    {
        // console.log("STATE Changed " + this.entity.uuid);
        this.entity.noOfAttempts = 0;
        

        if(Math.random() > 0.2)
        {
            this.entity.isInBoostedMode = true;
        }

    
    }

    onExit()
    {
        this.entity.isInBoostedMode = false;
    }
    onUpdate(dt)
    {

        let dir = this.entity.isFacingTowardsBounds;
        
        if(this.entity.isTurning)
            return;

        if(dir == null)
        {
            this.entity.changeDirection(this.getDirection, 200);
        } else
        {
            dir = normalize(dir); 
            this.entity.changeDirection(dir, 350);
        }
    }

    get getDirection()
    {

        
        const ownPos = new PIXI.Point(this.entity.body.position[0], this.entity.body.position[1]);
        const targetPos = new PIXI.Point(this.entity.followTarget.body.position[0], this.entity.followTarget.body.position[1]);

        const direction = getDirectionBetween(targetPos, ownPos);

        if(getMagnitude(direction) > this.entity.followTargetDistance)
        {
            this.entity.followTarget = null;
        }
        

        return normalize(direction);
    }
}