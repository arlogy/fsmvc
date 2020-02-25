/*
 This script was first written in 2010. It has been refactored in 2020 to be
 versatile and reusable in other projetcs. More on these as you keep reading.

 --- 2010 ---

 Finite State Machine Designer (http://madebyevan.com/fsm/)
 License: MIT License (see below)

 Copyright (c) 2010 Evan Wallace

 Permission is hereby granted, free of charge, to any person
 obtaining a copy of this software and associated documentation
 files (the "Software"), to deal in the Software without
 restriction, including without limitation the rights to use,
 copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following
 conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.

 --- 2020 ---

 Copyright (c) 2020 Fadyl Sokenou
     - MIT Licensed (same agreements as stated above)
     - Project and test pages at https://github.com/arlogy/fsmvc
     - Changes made to this file and convenient short documentation below

 This script has been refactored so that any web-based project can use it as a
 tool to control the rendering process of relatively small finite state
 machines. But it is more generic than that: it provides routines to display
 graphs (a graph being a set of nodes possibly connected by links). Note that
 the actual view where content will be displayed must be an Html canvas element.
 And when defining canvas in Html don't set 'width' and 'height' from CSS code;
 otherwise you might not be able to interact with canvas. Instead set those
 properties directly in Html <canvas> tag or later from JavaScript code.

 This controller features import/export in custom JSON format. But in case you
 prefer to use your own model (for instance when you have a tree-type designed
 to support several tree traversal algorithms), one way to sort things out is to
 do as follows.
     1. Perform import/export in the format expected by this controller.
     2. Once data are imported, grab the content of the canvas and fill your
        own model from that.

 When this script is executed an object named Fsmvc (Finite State Machine View
 Controller) is created. It hosts several properties to customize what to render
 and how to render. For detailed information please take a look at the
 return-statement at the end of this file.

 Side notes: the thickness properties ('borderWidth' for nodes and 'lineWidth'
 for links) are not introduced because otherwise one will need to update the
 algorithms used to find the selected object from given mouse position, the
 drawing functions and probably more.
*/

// Custom string formatting.
// Use cases: - '{0}.{1}.{2} {2}s {0}s'.format('String', 'prototype', 'format')
//            - '{0} {1} {0}'.format('{1}', 'Replaced')
if(!String.prototype.format) {
    String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) {
            return typeof args[number] != 'undefined' ? args[number] : match;
        });
    };
}

// Polyfill for Array.isArray().
if(!Array.isArray) {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}

var Fsmvc = (function() {
    var config = { // This config object is setup for use with finite state machines.
                   // Its properties can later be altered to support other types of data structures.
        'global': {
            'autoBackup': true, // tells whether a local backup must be saved automatically,
                                // in which case it is also restored automatically
            'autoBackupId': 'fsmvc_autoBackup_id', // the id used for auto-backup when enabled
                                                   // you might want to set this to distinguish between backups
        },
        'canvas': {
            'acceptLinks': true, // tells whether instances of Link can be pushed into canvas (not just from the user interface)
                                 // useful in case one wants to use this controller to display data models other than networks (arrays for instance)
            'acceptSelfLinks': true, // same here but for instances of SelfLink
            'acceptStartLinks': true, // same here but for instances of StartLink
            'font': '20px "Times New Roman", serif', // fixed font for canvas elements
                                                     // there is no need to set a specific font for each element
            'fontTextVerticalPadding': 5, // value used to give the impression that the text displayed for nodes is vertically centered
                                          // it is font-dependant and also affects text positioning for links
                                          // so value must be set accordingly
                                          // when testing consider trying different letter shapes (a, b and p should be enough)
            'lineDashSegments': [5, 3], // defines the line dash pattern to use for canvas items with dashes enabled
                                        // [5, 3] means that each dash will be 5px, followed by a space of 3px
                                        // see Html canvas setLineDash() method for detailed information
            'opacity': 1, // inherited by all canvas elements
        },
        'links': {
            'arrowHeadAtSrc': false, // inherited by all instances of Link
            'arrowHeadAtSrcOverridable': false, // tells whether property can be overridden from the outside (when importing JSON content)
            'arrowHeadAtDst': true,  // inherited by all instances of Link and SelfLink
            'arrowHeadAtDstOverridable': false, // tells whether property can be overridden from the outside (when importing JSON content)
            'lineColor': 'black', // inherited by all links
            'arrowColor': 'black', // inherited by all links
            'textColor': 'black', // inherited by all links
        },
        'nodes': {
            'radius': 25, // inherited by all nodes
            'canBeAcceptStates': true, // tells whether nodes are states (in a finite state machine) and thus can become accepting
            'distanceToInnerCircle': 5, // fixed distance between the border of a node and the inner ircle that indicates that node is a accepting state
            'borderColor': 'black', // inherited by all nodes
            'bgColor': 'transparent', // inherited by all nodes
            'textColor': 'black', // inherited by all nodes
        },
    };

    function Node(x, y) {
        this.x = x;
        this.y = y;
        this.text = '';
        this.isInitialState = false;
        this.isAcceptState = false;
        this.radius = config.nodes.radius;
        this.opacity = config.canvas.opacity;
        this.dashesEnabled = false;
        readColorPropsNoCheckings(['borderColor', 'bgColor', 'textColor'], config.nodes, this);

        this.mouseOffsetX = 0;
        this.mouseOffsetY = 0;
    }

    Node.prototype.toJson = function() {
        return {
            'x': this.x,
            'y': this.y,
            'text': this.text,
            'isAcceptState': this.isAcceptState,
            'radius': this.radius,
            'opacity': this.opacity,
            'dashesEnabled': this.dashesEnabled,
            'borderColor': this.borderColor,
            'bgColor': this.bgColor,
            'textColor': this.textColor,
            'readonly.isInitialState': this.isInitialState,
        };
    };

    Node.fromJson = function(obj) {
        try {
            var nodeX = valueIsNumber(obj.x) ? obj.x : canvas.width/4;
            var nodeY = valueIsNumber(obj.y) ? obj.y : canvas.height/4;
            var node = new Node(nodeX, nodeY);
            node.text = valueIsString(obj.text) ? obj.text : '';
            node.isAcceptState = config.nodes.canBeAcceptStates && valueIsBoolean(obj.isAcceptState) && obj.isAcceptState;
            node.radius = valueIsNumber(obj.radius) ? obj.radius : node.radius;
            if(node.radius <= config.nodes.distanceToInnerCircle) {
                node.radius = config.nodes.distanceToInnerCircle;
            }
            node.opacity = valueIsNumberInRange(obj.opacity, 0, 1) ? obj.opacity : node.opacity;
            node.dashesEnabled = valueIsBoolean(obj.dashesEnabled) && obj.dashesEnabled;
            readColorProps(['borderColor', 'bgColor', 'textColor'], obj, node);
            return node;
        } catch(e) {}
        return null;
    };

    Node.prototype.setMouseStart = function(x, y) {
        this.mouseOffsetX = this.x - x;
        this.mouseOffsetY = this.y - y;
    };

    Node.prototype.setAnchorPoint = function(x, y) {
        this.x = x + this.mouseOffsetX;
        this.y = y + this.mouseOffsetY;
    };

    Node.prototype.draw = function(c, isSelected) {
        c.globalAlpha = this.opacity;
        c.fillStyle = this.bgColor;
        c.strokeStyle = this.borderColor;
        c.setLineDash(this.dashesEnabled ? config.canvas.lineDashSegments : []);

        // draw the circle
        c.beginPath();
        c.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false);
        c.fill();
        c.stroke();

        // draw a double circle for an accept state (must be drawn before text)
        if(this.isAcceptState) {
            c.beginPath();
            c.arc(this.x, this.y, this.radius - config.nodes.distanceToInnerCircle, 0, 2 * Math.PI, false);
            c.fill();
            c.stroke();
        }

        c.setLineDash([]);

        // draw the text
        c.fillStyle = this.textColor;
        c.strokeStyle = this.textColor;
        drawText(c, this.text, this.x, this.y, null, isSelected);
    };

    Node.prototype.closestPointOnCircle = function(x, y) {
        var dx = x - this.x;
        var dy = y - this.y;
        var scale = Math.sqrt(dx * dx + dy * dy);
        return {
            'x': this.x + dx * this.radius / scale,
            'y': this.y + dy * this.radius / scale,
        };
    };

    Node.prototype.containsPoint = function(x, y) {
        return (x - this.x)*(x - this.x) + (y - this.y)*(y - this.y) < this.radius*this.radius;
    };

    // Link between two distinct nodes.
    function Link(a, b) {
        this.nodeA = a;
        this.nodeAHasArrow = config.links.arrowHeadAtSrc;
        this.nodeB = b;
        this.nodeBHasArrow = config.links.arrowHeadAtDst;
        this.text = '';
        this.opacity = config.canvas.opacity;
        this.dashesEnabled = false;
        readColorPropsNoCheckings(['lineColor', 'arrowColor', 'textColor'], config.links, this);

        this.lineAngleAdjust = 0; // value to add to textAngle when link is straight line
        // make anchor point relative to the locations of nodeA and nodeB
        this.parallelPart = 0.5; // percentage from nodeA to nodeB
        this.perpendicularPart = 0; // pixels from line between nodeA and nodeB
    };

    Link.prototype.getTwoExtremityNodes = function() {
        return [this.nodeA, this.nodeB];
    }

    Link.prototype.toJson = function(nodes) {
        return {
            'type': 'Link',
            'nodeAIndex': nodes.indexOf(this.nodeA),
            'nodeAHasArrow': this.nodeAHasArrow,
            'nodeBIndex': nodes.indexOf(this.nodeB),
            'nodeBHasArrow': this.nodeBHasArrow,
            'text': this.text,
            'opacity': this.opacity,
            'dashesEnabled': this.dashesEnabled,
            'lineColor': this.lineColor,
            'arrowColor': this.arrowColor,
            'textColor': this.textColor,
            'lineAngleAdjust': this.lineAngleAdjust,
            'parallelPart': this.parallelPart,
            'perpendicularPart': this.perpendicularPart,
        };
    };

    Link.fromJson = function(obj, nodes) {
        try {
            if(obj.type === 'Link' && obj.nodeAIndex !== obj.nodeBIndex) { // see (1) below
                var link = new Link(getNodeElt(nodes, obj.nodeAIndex), getNodeElt(nodes, obj.nodeBIndex));
                link.nodeAHasArrow = config.links.arrowHeadAtSrcOverridable ? valueIsBoolean(obj.nodeAHasArrow) && obj.nodeAHasArrow : link.nodeAHasArrow;
                link.nodeBHasArrow = config.links.arrowHeadAtDstOverridable ? valueIsBoolean(obj.nodeBHasArrow) && obj.nodeBHasArrow : link.nodeBHasArrow;
                link.text = valueIsString(obj.text) ? obj.text : '';
                link.opacity = valueIsNumberInRange(obj.opacity, 0, 1) ? obj.opacity : link.opacity;
                link.dashesEnabled = valueIsBoolean(obj.dashesEnabled) && obj.dashesEnabled;
                readColorProps(['lineColor', 'arrowColor', 'textColor'], obj, link);
                link.lineAngleAdjust = valueIsNumber(obj.lineAngleAdjust) ? obj.lineAngleAdjust : link.lineAngleAdjust;
                link.parallelPart = valueIsNumber(obj.parallelPart) ? obj.parallelPart : link.parallelPart;
                link.perpendicularPart = valueIsNumber(obj.perpendicularPart) ? obj.perpendicularPart : link.perpendicularPart;
                return link;
            }
        } catch(e) {}
        return null;

        // (1) We don't actually need to check that nodes are different because
        //     in case they are not the observed behaviour is similar to the
        //     case where nodes are different but at the exact same position:
        //     the link is there but not visible on screen. But we prefer to
        //     ignore instances of Link between two identical nodes because we
        //     already have the SelfLink class.
    };

    Link.prototype.prepareInsertionToCanvas = function() {
        return config.canvas.acceptLinks;
    };

    Link.prototype.prepareRemovalFromCanvas = function() {
        // nothing to do
    };

    Link.prototype.getAnchorPoint = function() {
        var dx = this.nodeB.x - this.nodeA.x;
        var dy = this.nodeB.y - this.nodeA.y;
        var scale = Math.sqrt(dx * dx + dy * dy);
        return {
            'x': this.nodeA.x + dx * this.parallelPart - dy * this.perpendicularPart / scale,
            'y': this.nodeA.y + dy * this.parallelPart + dx * this.perpendicularPart / scale
        };
    };

    Link.prototype.setAnchorPoint = function(x, y) {
        var dx = this.nodeB.x - this.nodeA.x;
        var dy = this.nodeB.y - this.nodeA.y;
        var scale = Math.sqrt(dx * dx + dy * dy);
        this.parallelPart = (dx * (x - this.nodeA.x) + dy * (y - this.nodeA.y)) / (scale * scale);
        this.perpendicularPart = (dx * (y - this.nodeA.y) - dy * (x - this.nodeA.x)) / scale;
        // snap to a straight line
        if(this.parallelPart > 0 && this.parallelPart < 1 && Math.abs(this.perpendicularPart) < snapToPadding) {
            this.lineAngleAdjust = (this.perpendicularPart < 0) * Math.PI;
            this.perpendicularPart = 0;
        }
    };

    Link.prototype.getEndPointsAndCircle = function() {
        if(this.perpendicularPart === 0) {
            var midX = (this.nodeA.x + this.nodeB.x) / 2;
            var midY = (this.nodeA.y + this.nodeB.y) / 2;
            var start = this.nodeA.closestPointOnCircle(midX, midY);
            var end = this.nodeB.closestPointOnCircle(midX, midY);
            return {
                'hasCircle': false,
                'startX': start.x,
                'startY': start.y,
                'startArrowRequested': this.nodeAHasArrow,
                'endX': end.x,
                'endY': end.y,
                'endArrowRequested': this.nodeBHasArrow,
            };
        }
        var anchor = this.getAnchorPoint();
        var circle = circleFromThreePoints(this.nodeA.x, this.nodeA.y, this.nodeB.x, this.nodeB.y, anchor.x, anchor.y);
        var isReversed = (this.perpendicularPart > 0);
        var reverseScale = isReversed ? 1 : -1;
        var startAngle = Math.atan2(this.nodeA.y - circle.y, this.nodeA.x - circle.x) - reverseScale * this.nodeA.radius / circle.radius;
        var endAngle = Math.atan2(this.nodeB.y - circle.y, this.nodeB.x - circle.x) + reverseScale * this.nodeB.radius / circle.radius;
        var startX = circle.x + circle.radius * Math.cos(startAngle);
        var startY = circle.y + circle.radius * Math.sin(startAngle);
        var endX = circle.x + circle.radius * Math.cos(endAngle);
        var endY = circle.y + circle.radius * Math.sin(endAngle);
        return {
            'hasCircle': true,
            'startX': startX,
            'startY': startY,
            'startArrowRequested': this.nodeAHasArrow,
            'endX': endX,
            'endY': endY,
            'endArrowRequested': this.nodeBHasArrow,
            'startAngle': startAngle,
            'endAngle': endAngle,
            'circleX': circle.x,
            'circleY': circle.y,
            'circleRadius': circle.radius,
            'reverseScale': reverseScale,
            'isReversed': isReversed,
        };
    };

    Link.prototype.draw = function(c, isSelected) {
        var stuff = this.getEndPointsAndCircle();
        c.globalAlpha = this.opacity;

        // draw the arc
        c.fillStyle = 'transparent'; // not important for canvas because we don't c.fill() but important for SVG export which uses this property when arc()ing
        c.strokeStyle = this.lineColor;
        c.setLineDash(this.dashesEnabled ? config.canvas.lineDashSegments : []);
        c.beginPath();
        if(stuff.hasCircle) {
            c.arc(stuff.circleX, stuff.circleY, stuff.circleRadius, stuff.startAngle, stuff.endAngle, stuff.isReversed);
        } else {
            c.moveTo(stuff.startX, stuff.startY);
            c.lineTo(stuff.endX, stuff.endY);
        }
        c.stroke();
        c.setLineDash([]);

        // draw the heads of the arrow
        c.fillStyle = this.arrowColor;
        if(stuff.hasCircle) {
            if(stuff.startArrowRequested) {
                drawArrow(c, stuff.startX, stuff.startY, stuff.startAngle + stuff.reverseScale * (Math.PI / 2));
            }
            if(stuff.endArrowRequested) {
                drawArrow(c, stuff.endX, stuff.endY, stuff.endAngle - stuff.reverseScale * (Math.PI / 2));
            }
        } else {
            if(stuff.startArrowRequested) {
                drawArrow(c, stuff.startX, stuff.startY, Math.atan2(stuff.startY - stuff.endY, stuff.startX - stuff.endX));
            }
            if(stuff.endArrowRequested) {
                drawArrow(c, stuff.endX, stuff.endY, Math.atan2(stuff.endY - stuff.startY, stuff.endX - stuff.startX));
            }
        }

        // draw the text
        c.fillStyle = this.textColor;
        if(stuff.hasCircle) {
            var startAngle = stuff.startAngle;
            var endAngle = stuff.endAngle;
            if(endAngle < startAngle) {
                endAngle += Math.PI * 2;
            }
            var textAngle = (startAngle + endAngle) / 2 + stuff.isReversed * Math.PI;
            var textX = stuff.circleX + stuff.circleRadius * Math.cos(textAngle);
            var textY = stuff.circleY + stuff.circleRadius * Math.sin(textAngle);
            drawText(c, this.text, textX, textY, textAngle, isSelected);
        } else {
            var textX = (stuff.startX + stuff.endX) / 2;
            var textY = (stuff.startY + stuff.endY) / 2;
            var textAngle = Math.atan2(stuff.endX - stuff.startX, stuff.startY - stuff.endY);
            drawText(c, this.text, textX, textY, textAngle + this.lineAngleAdjust, isSelected);
        }
    };

    Link.prototype.containsPoint = function(x, y) {
        var stuff = this.getEndPointsAndCircle();
        if(stuff.hasCircle) {
            var dx = x - stuff.circleX;
            var dy = y - stuff.circleY;
            var distance = Math.sqrt(dx*dx + dy*dy) - stuff.circleRadius;
            if(Math.abs(distance) < hitTargetPadding) {
                var angle = Math.atan2(dy, dx);
                var startAngle = stuff.startAngle;
                var endAngle = stuff.endAngle;
                if(stuff.isReversed) {
                    var temp = startAngle;
                    startAngle = endAngle;
                    endAngle = temp;
                }
                if(endAngle < startAngle) {
                    endAngle += Math.PI * 2;
                }
                if(angle < startAngle) {
                    angle += Math.PI * 2;
                } else if(angle > endAngle) {
                    angle -= Math.PI * 2;
                }
                return (angle > startAngle && angle < endAngle);
            }
        } else {
            var dx = stuff.endX - stuff.startX;
            var dy = stuff.endY - stuff.startY;
            var length = Math.sqrt(dx*dx + dy*dy);
            var percent = (dx * (x - stuff.startX) + dy * (y - stuff.startY)) / (length * length);
            var distance = (dx * (y - stuff.startY) - dy * (x - stuff.startX)) / length;
            return (percent > 0 && percent < 1 && Math.abs(distance) < hitTargetPadding);
        }
        return false;
    };

    // Link from one node to itself (i.e. loop).
    function SelfLink(node, mouse) {
        this.node = node;
        this.nodeHasArrow = config.links.arrowHeadAtDst;
        this.text = '';
        this.opacity = config.canvas.opacity;
        this.dashesEnabled = false;
        readColorPropsNoCheckings(['lineColor', 'arrowColor', 'textColor'], config.links, this);

        this.anchorAngle = 0;
        this.mouseOffsetAngle = 0;

        if(mouse) {
            this.setAnchorPoint(mouse.x, mouse.y);
        }
    }

    SelfLink.prototype.getTwoExtremityNodes = function() {
        return [this.node, this.node];
    }

    SelfLink.prototype.toJson = function(nodes) {
        return {
            'type': 'SelfLink',
            'nodeIndex': nodes.indexOf(this.node),
            'nodeHasArrow': this.nodeHasArrow,
            'text': this.text,
            'opacity': this.opacity,
            'dashesEnabled': this.dashesEnabled,
            'lineColor': this.lineColor,
            'arrowColor': this.arrowColor,
            'textColor': this.textColor,
            'anchorAngle': this.anchorAngle,
        };
    };

    SelfLink.fromJson = function(obj, nodes) {
        try {
            if(obj.type === 'SelfLink') {
                var link = new SelfLink(getNodeElt(nodes, obj.nodeIndex));
                link.nodeHasArrow = config.links.arrowHeadAtDstOverridable ? valueIsBoolean(obj.nodeHasArrow) && obj.nodeHasArrow : link.nodeHasArrow;
                link.text = valueIsString(obj.text) ? obj.text : '';
                link.opacity = valueIsNumberInRange(obj.opacity, 0, 1) ? obj.opacity : link.opacity;
                link.dashesEnabled = valueIsBoolean(obj.dashesEnabled) && obj.dashesEnabled;
                readColorProps(['lineColor', 'arrowColor', 'textColor'], obj, link);
                link.anchorAngle = valueIsNumber(obj.anchorAngle) ? obj.anchorAngle : link.anchorAngle;
                return link;
            }
        } catch(e) {}
        return null;
    };

    SelfLink.prototype.prepareInsertionToCanvas = function() {
        return config.canvas.acceptSelfLinks;
    };

    SelfLink.prototype.prepareRemovalFromCanvas = function() {
        // nothing to do
    };

    SelfLink.prototype.setMouseStart = function(x, y) {
        this.mouseOffsetAngle = this.anchorAngle - Math.atan2(y - this.node.y, x - this.node.x);
    };

    SelfLink.prototype.setAnchorPoint = function(x, y) {
        this.anchorAngle = Math.atan2(y - this.node.y, x - this.node.x) + this.mouseOffsetAngle;
        // snap to 90 degrees
        var snap = Math.round(this.anchorAngle / (Math.PI / 2)) * (Math.PI / 2);
        if(Math.abs(this.anchorAngle - snap) < 0.1) this.anchorAngle = snap;
        // keep in the range -pi to pi so our containsPoint() function always works
        if(this.anchorAngle < -Math.PI) this.anchorAngle += 2 * Math.PI;
        if(this.anchorAngle > Math.PI) this.anchorAngle -= 2 * Math.PI;
    };

    SelfLink.prototype.getEndPointsAndCircle = function() {
        var circleX = this.node.x + 1.5 * this.node.radius * Math.cos(this.anchorAngle);
        var circleY = this.node.y + 1.5 * this.node.radius * Math.sin(this.anchorAngle);
        var circleRadius = 0.75 * this.node.radius;
        var startAngle = this.anchorAngle - Math.PI * 0.8;
        var endAngle = this.anchorAngle + Math.PI * 0.8;
        var startX = circleX + circleRadius * Math.cos(startAngle);
        var startY = circleY + circleRadius * Math.sin(startAngle);
        var endX = circleX + circleRadius * Math.cos(endAngle);
        var endY = circleY + circleRadius * Math.sin(endAngle);
        return {
            'hasCircle': true,
            'startX': startX,
            'startY': startY,
            'endX': endX,
            'endY': endY,
            'startAngle': startAngle,
            'endAngle': endAngle,
            'circleX': circleX,
            'circleY': circleY,
            'circleRadius': circleRadius,
            'arrowRequested': this.nodeHasArrow,
        };
    };

    SelfLink.prototype.draw = function(c, isSelected) {
        var stuff = this.getEndPointsAndCircle();
        c.globalAlpha = this.opacity;

        // draw the arc
        c.fillStyle = 'transparent'; // not important for canvas because we don't c.fill() but important for SVG export which uses this property when arc()ing
        c.strokeStyle = this.lineColor;
        c.setLineDash(this.dashesEnabled ? config.canvas.lineDashSegments : []);
        c.beginPath();
        c.arc(stuff.circleX, stuff.circleY, stuff.circleRadius, stuff.startAngle, stuff.endAngle, false);
        c.stroke();
        c.setLineDash([]);

        // draw the head of the arrow
        c.fillStyle = this.arrowColor;
        if(stuff.arrowRequested) {
            drawArrow(c, stuff.endX, stuff.endY, stuff.endAngle + Math.PI * 0.4);
        }

        // draw the text on the loop farthest from the node
        c.fillStyle = this.textColor;
        var textX = stuff.circleX + stuff.circleRadius * Math.cos(this.anchorAngle);
        var textY = stuff.circleY + stuff.circleRadius * Math.sin(this.anchorAngle);
        drawText(c, this.text, textX, textY, this.anchorAngle, isSelected);
    };

    SelfLink.prototype.containsPoint = function(x, y) {
        var stuff = this.getEndPointsAndCircle();
        var dx = x - stuff.circleX;
        var dy = y - stuff.circleY;
        var distance = Math.sqrt(dx*dx + dy*dy) - stuff.circleRadius;
        return (Math.abs(distance) < hitTargetPadding);
    };

    // Link to represent initial states in finite state machines.
    function StartLink(node, start) {
        this.node = node;
        this.text = '';
        this.opacity = config.canvas.opacity;
        this.dashesEnabled = false;
        readColorPropsNoCheckings(['lineColor', 'arrowColor', 'textColor'], config.links, this);
        this.sychronizeVisualWithNode = true;

        this.deltaX = 0;
        this.deltaY = 0;

        if(start) {
            this.setAnchorPoint(start.x, start.y);
        }
    }

    StartLink.prototype.toJson = function(nodes) {
        return {
            'type': 'StartLink',
            'nodeIndex': nodes.indexOf(this.node),
            'text': this.text,
            'opacity': this.opacity,
            'dashesEnabled': this.dashesEnabled,
            'lineColor': this.lineColor,
            'arrowColor': this.arrowColor,
            'textColor': this.textColor,
            'sychronizeVisualWithNode': this.sychronizeVisualWithNode,
            'deltaX': this.deltaX,
            'deltaY': this.deltaY,
        };
    };

    StartLink.fromJson = function(obj, nodes) {
        try {
            if(obj.type === 'StartLink') {
                var link = new StartLink(getNodeElt(nodes, obj.nodeIndex));
                link.text = valueIsString(obj.text) ? obj.text : '';
                link.opacity = valueIsNumberInRange(obj.opacity, 0, 1) ? obj.opacity : link.opacity;
                link.dashesEnabled = valueIsBoolean(obj.dashesEnabled) && obj.dashesEnabled;
                readColorProps(['lineColor', 'arrowColor', 'textColor'], obj, link);
                link.sychronizeVisualWithNode = valueIsBoolean(obj.sychronizeVisualWithNode) && obj.sychronizeVisualWithNode;
                link.deltaX = valueIsNumber(obj.deltaX) ? obj.deltaX : link.deltaX;
                link.deltaY = valueIsNumber(obj.deltaY) ? obj.deltaY : link.deltaY;
                return link;
            }
        } catch(e) {}
        return null;
    };

    StartLink.prototype.prepareInsertionToCanvas = function() {
        if(config.canvas.acceptStartLinks && !this.node.isInitialState) {
            this.node.isInitialState = true;
            return true;
        }
        return false;
    };

    StartLink.prototype.prepareRemovalFromCanvas = function() {
        this.node.isInitialState = false;
    };

    StartLink.prototype.setAnchorPoint = function(x, y) {
        this.deltaX = x - this.node.x;
        this.deltaY = y - this.node.y;

        if(Math.abs(this.deltaX) < snapToPadding) {
            this.deltaX = 0;
        }

        if(Math.abs(this.deltaY) < snapToPadding) {
            this.deltaY = 0;
        }
    };

    StartLink.prototype.getEndPoints = function() {
        var startX = this.node.x + this.deltaX;
        var startY = this.node.y + this.deltaY;
        var end = this.node.closestPointOnCircle(startX, startY);
        return {
            'startX': startX,
            'startY': startY,
            'endX': end.x,
            'endY': end.y,
        };
    };

    StartLink.prototype.draw = function(c, isSelected) {
        var stuff = this.getEndPoints();
        c.globalAlpha = this.sychronizeVisualWithNode ?
                        this.node.opacity*0.9 : // make sure node and links look similar
                        this.opacity;

        // draw the line
        c.strokeStyle = this.sychronizeVisualWithNode ? this.node.borderColor : this.lineColor;
        c.setLineDash((this.sychronizeVisualWithNode ? this.node.dashesEnabled : this.dashesEnabled) ? config.canvas.lineDashSegments : []);
        c.beginPath();
        c.moveTo(stuff.startX, stuff.startY);
        c.lineTo(stuff.endX, stuff.endY);
        c.stroke();
        c.setLineDash([]);

        // draw the head of the arrow
        c.fillStyle = this.sychronizeVisualWithNode ? this.node.borderColor : this.arrowColor;
        if(config.links.arrowHeadAtDst) {
            drawArrow(c, stuff.endX, stuff.endY, Math.atan2(-this.deltaY, -this.deltaX));
        }

        // draw the text at the end without the arrow
        c.fillStyle = this.sychronizeVisualWithNode ? this.node.borderColor : this.textColor;
        var textAngle = Math.atan2(stuff.startY - stuff.endY, stuff.startX - stuff.endX);
        drawText(c, this.text, stuff.startX, stuff.startY, textAngle, isSelected);
    };

    StartLink.prototype.containsPoint = function(x, y) {
        var stuff = this.getEndPoints();
        var dx = stuff.endX - stuff.startX;
        var dy = stuff.endY - stuff.startY;
        var length = Math.sqrt(dx*dx + dy*dy);
        var percent = (dx * (x - stuff.startX) + dy * (y - stuff.startY)) / (length * length);
        var distance = (dx * (y - stuff.startY) - dy * (x - stuff.startX)) / length;
        return (percent > 0 && percent < 1 && Math.abs(distance) < hitTargetPadding);
    };

    function TemporaryLink(from, to) {
        this.from = from;
        this.to = to;
    }

    TemporaryLink.prototype.prepareInsertionToCanvas = function() {
        return false;
    };

    TemporaryLink.prototype.draw = function(c, isSelected) {
        c.globalAlpha = config.canvas.opacity;
        c.fillStyle = config.links.arrowColor;
        c.strokeStyle = config.links.lineColor;

        // draw the line
        c.beginPath();
        c.moveTo(this.to.x, this.to.y);
        c.lineTo(this.from.x, this.from.y);
        c.stroke();

        // draw the heads of the arrow
        if(config.links.arrowHeadAtSrc) {
            drawArrow(c, this.from.x, this.from.y, Math.atan2(this.from.y - this.to.y, this.from.x - this.to.x));
        }
        if(config.links.arrowHeadAtDst) {
            drawArrow(c, this.to.x, this.to.y, Math.atan2(this.to.y - this.from.y, this.to.x - this.from.x));
        }
    };

    // Draw using this instead of a canvas and call toLaTeX() afterward.
    // Very few visual attributes are exported.
    function ExportAsLaTeX() {
        this.strokeStyle = 'black';
        this._points = [];
        this._texData = '';
        this._scale = 0.1; // to convert pixels to document space (TikZ breaks if the numbers get too big, above 500?)

        this.toLaTeX = function() {
            return '\\documentclass[12pt]{article}\n' +
                '\\usepackage{tikz}\n' +
                '\n' +
                '\\begin{document}\n' +
                '\n' +
                '\\begin{center}\n' +
                '\\begin{tikzpicture}[scale=0.2]\n' +
                '\\tikzstyle{every node}+=[inner sep=0pt]\n' +
                this._texData +
                '\\end{tikzpicture}\n' +
                '\\end{center}\n' +
                '\n' +
                '\\end{document}\n';
        };

        this.beginPath = function() {
            this._points = [];
        };
        this.arc = function(x, y, radius, startAngle, endAngle, isReversed) {
            x *= this._scale;
            y *= this._scale;
            radius *= this._scale;
            if(endAngle - startAngle == Math.PI * 2) {
                this._texData += '\\draw [' + this.strokeStyle + '] (' + fixed(x, 3) + ',' + fixed(-y, 3) + ') circle (' + fixed(radius, 3) + ');\n';
            } else {
                if(isReversed) {
                    var temp = startAngle;
                    startAngle = endAngle;
                    endAngle = temp;
                }
                if(endAngle < startAngle) {
                    endAngle += Math.PI * 2;
                }
                // TikZ needs the angles to be in between -2pi and 2pi or it breaks
                if(Math.min(startAngle, endAngle) < -2*Math.PI) {
                    startAngle += 2*Math.PI;
                    endAngle += 2*Math.PI;
                } else if(Math.max(startAngle, endAngle) > 2*Math.PI) {
                    startAngle -= 2*Math.PI;
                    endAngle -= 2*Math.PI;
                }
                startAngle = -startAngle;
                endAngle = -endAngle;
                this._texData += '\\draw [' + this.strokeStyle + '] (' + fixed(x + radius * Math.cos(startAngle), 3) + ',' + fixed(-y + radius * Math.sin(startAngle), 3) + ') arc (' + fixed(startAngle * 180 / Math.PI, 5) + ':' + fixed(endAngle * 180 / Math.PI, 5) + ':' + fixed(radius, 3) + ');\n';
            }
        };
        this.moveTo = this.lineTo = function(x, y) {
            x *= this._scale;
            y *= this._scale;
            this._points.push({ 'x': x, 'y': y });
        };
        this.stroke = function() {
            if(this._points.length === 0) return;
            this._texData += '\\draw [' + this.strokeStyle + ']';
            for(var i = 0; i < this._points.length; i++) {
                var p = this._points[i];
                this._texData += (i > 0 ? ' --' : '') + ' (' + fixed(p.x, 2) + ',' + fixed(-p.y, 2) + ')';
            }
            this._texData += ';\n';
        };
        this.fill = function() {
            if(this._points.length === 0) return;
            this._texData += '\\fill [' + this.strokeStyle + ']';
            for(var i = 0; i < this._points.length; i++) {
                var p = this._points[i];
                this._texData += (i > 0 ? ' --' : '') + ' (' + fixed(p.x, 2) + ',' + fixed(-p.y, 2) + ')';
            }
            this._texData += ';\n';
        };
        this.measureText = function(text) {
            var c = canvas.getContext('2d');
            c.font = '20px "Times New Romain", serif';
            return c.measureText(text);
        };
        this.advancedFillText = function(text, originalText, x, y, angleOrNull) {
            if(text.replace(' ', '').length > 0) {
                var nodeParams = '';
                // x and y start off as the center of the text, but will be moved to one side of the box when angleOrNull != null
                if(angleOrNull !== null) {
                    var width = this.measureText(text).width;
                    var dx = Math.cos(angleOrNull);
                    var dy = Math.sin(angleOrNull);
                    if(Math.abs(dx) > Math.abs(dy)) {
                        if(dx > 0) { nodeParams = '[right] '; x -= width / 2; }
                        else { nodeParams = '[left] '; x += width / 2; }
                    } else {
                        if(dy > 0) { nodeParams = '[below] '; y -= 10; }
                        else { nodeParams = '[above] '; y += 10; }
                    }
                }
                x *= this._scale;
                y *= this._scale;
                this._texData += '\\draw (' + fixed(x, 2) + ',' + fixed(-y, 2) + ') node ' + nodeParams + '{$' + originalText.replace(/ /g, '\\mbox{ }') + '$};\n';
            }
        };

        this.setLineDash = this.translate = this.save = this.restore = this.clearRect = function(){};
    }

    // Draw using this instead of a canvas and call toSVG() afterward.
    // All visual attributes are exported.
    function ExportAsSVG() {
        this.globalAlpha = 1;
        this.fillStyle = 'black';
        this.strokeStyle = 'black';
        this.lineWidth = 1;
        this.font = '12px Arial, sans-serif';
        this._lineDashSegments = "";
        this._points = [];
        this._svgData = '';
        this._transX = 0;
        this._transY = 0;

        this.style = function() {
            return 'stroke="{0}" stroke-opacity="{1}" stroke-width="{2}" stroke-dasharray="{3}" fill="{4}" fill-opacity="{5}"'
                  .format(this.strokeStyle, this.globalAlpha, this.lineWidth, this._lineDashSegments, this.fillStyle, this.globalAlpha);
        }
        this.styleForFill = function() {
            return 'fill="{0}" fill-opacity="{1}" stroke-width="{2}" stroke-dasharray="{3}"'
                  .format(this.fillStyle, this.globalAlpha, this.lineWidth, this._lineDashSegments);
        }
        this.styleForStroke = function() {
            return 'stroke="{0}" stroke-opacity="{1}" stroke-width="{2}" stroke-dasharray="{3}"'
                  .format(this.strokeStyle, this.globalAlpha, this.lineWidth, this._lineDashSegments);
        }

        this.toSVG = function() {
            return '<?xml version="1.0" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n\n<svg width="{0}" height="{1}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n'
                  .format(canvas.width, canvas.height)
                 + this._svgData
                 + '</svg>\n';
        };

        this.setLineDash = function(segments) {
            this._lineDashSegments = segments.join(', ');
        }
        this.beginPath = function() {
            this._points = [];
        };
        this.arc = function(x, y, radius, startAngle, endAngle, isReversed) {
            x += this._transX;
            y += this._transY;

            if(endAngle - startAngle == Math.PI * 2) {
                this._svgData += '\t<ellipse ' + this.style() + ' cx="' + fixed(x, 3) + '" cy="' + fixed(y, 3) + '" rx="' + fixed(radius, 3) + '" ry="' + fixed(radius, 3) + '"/>\n';
            } else {
                if(isReversed) {
                    var temp = startAngle;
                    startAngle = endAngle;
                    endAngle = temp;
                }

                if(endAngle < startAngle) {
                    endAngle += Math.PI * 2;
                }

                var startX = x + radius * Math.cos(startAngle);
                var startY = y + radius * Math.sin(startAngle);
                var endX = x + radius * Math.cos(endAngle);
                var endY = y + radius * Math.sin(endAngle);
                var useGreaterThan180 = (Math.abs(endAngle - startAngle) > Math.PI);
                var goInPositiveDirection = 1;

                this._svgData += '\t<path ' + this.style() + ' d="';
                this._svgData += 'M ' + fixed(startX, 3) + ',' + fixed(startY, 3) + ' '; // startPoint(startX, startY)
                this._svgData += 'A ' + fixed(radius, 3) + ',' + fixed(radius, 3) + ' '; // radii(radius, radius)
                this._svgData += '0 '; // value of 0 means perfect circle, others mean ellipse
                this._svgData += +useGreaterThan180 + ' ';
                this._svgData += +goInPositiveDirection + ' ';
                this._svgData += fixed(endX, 3) + ',' + fixed(endY, 3); // endPoint(endX, endY)
                this._svgData += '"/>\n';
            }
        };
        this.moveTo = this.lineTo = function(x, y) {
            x += this._transX;
            y += this._transY;
            this._points.push({ 'x': x, 'y': y });
        };
        this.stroke = function() {
            if(this._points.length === 0) return;
            this._svgData += '\t<polygon ' + this.styleForStroke() + ' points="';
            for(var i = 0; i < this._points.length; i++) {
                this._svgData += (i > 0 ? ' ' : '') + fixed(this._points[i].x, 3) + ',' + fixed(this._points[i].y, 3);
            }
            this._svgData += '"/>\n';
        };
        this.fill = function() {
            if(this._points.length === 0) return;
            this._svgData += '\t<polygon ' + this.styleForFill() + ' points="';
            for(var i = 0; i < this._points.length; i++) {
                this._svgData += (i > 0 ? ' ' : '') + fixed(this._points[i].x, 3) + ',' + fixed(this._points[i].y, 3);
            }
            this._svgData += '"/>\n';
        };
        this.measureText = function(text) {
            var c = canvas.getContext('2d');
            c.font = '20px "Times New Romain", serif';
            return c.measureText(text);
        };
        this.fillText = function(text, x, y) {
            x += this._transX;
            y += this._transY;
            if(text.replace(' ', '').length > 0) {
                this._svgData += '\t<text {0} x="'.format(this.styleForFill()) + fixed(x, 3) + '" y="' + fixed(y, 3) + '" font-family="Times New Roman" font-size="20">' + textToXML(text) + '</text>\n';
            }
        };
        this.translate = function(x, y) {
            this._transX = x;
            this._transY = y;
        };

        this.save = this.restore = this.clearRect = function(){};
    }

    function drawText(c, originalText, x, y, angleOrNull, isSelected) {
        text = convertLatexShortcuts(originalText);
        c.font = config.canvas.font;
        var width = c.measureText(text).width;

        // center the text horizontally
        x -= width / 2;

        // position the text intelligently if given an angle
        if(angleOrNull !== null) {
            var cos = Math.cos(angleOrNull);
            var sin = Math.sin(angleOrNull);
            var cornerPointX = (width / 2 + 5) * (cos > 0 ? 1 : -1);
            var cornerPointY = (10 + 5) * (sin > 0 ? 1 : -1);
            var slide = sin * Math.pow(Math.abs(sin), 40) * cornerPointX - cos * Math.pow(Math.abs(cos), 10) * cornerPointY;
            x += cornerPointX - sin * slide;
            y += cornerPointY + cos * slide;
        }

        // draw text and caret (round the coordinates so the caret falls on a pixel)
        if('advancedFillText' in c) {
            c.advancedFillText(text, originalText, x + width / 2, y, angleOrNull);
        } else {
            x = Math.round(x);
            y = Math.round(y);
            c.fillText(text, x, y + config.canvas.fontTextVerticalPadding);
            if(isSelected && caretVisible && canvasHasFocus() && document.hasFocus()) {
                x += width;
                c.beginPath();
                c.moveTo(x, y - 10);
                c.lineTo(x, y + 10);
                c.stroke();
            }
        }
    }

    function drawArrow(c, x, y, angle) {
        var dx = Math.cos(angle);
        var dy = Math.sin(angle);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 8 * dx + 5 * dy, y - 8 * dy - 5 * dx);
        c.lineTo(x - 8 * dx - 5 * dy, y - 8 * dy + 5 * dx);
        c.fill();
    }

    function textToXML(text) {
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var result = '';
        for(var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if(c >= 0x20 && c <= 0x7E) {
                result += text[i];
            } else {
                result += '&#' + c + ';';
            }
        }
        return result;
    }

    var greekLetterNames = [ 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega' ];

    // Transforms greek and subscript notations (in text) into actual characters.
    // Here are some input -> output examples:
    //     - '\\Beta' -> 'Β' and '\\beta' -> 'β' and '\\BeTa' -> '\BeTa' (left unchanged)
    //     - '\\Pi' -> 'Π' and '\\pi' -> 'π' and '\\pI' -> '\pI' (left unchanged)
    //     - '_0' -> '₀' thus 's_0' -> 's₀'
    // Note that the double '\\' is to escape '\'.
    function convertLatexShortcuts(text) {
        var i = 0;

        // Html greek characters
        for(i = 0; i < greekLetterNames.length; i++) {
            var name = greekLetterNames[i];
            text = text.replace(new RegExp('\\\\' + name, 'g'), String.fromCharCode(913 + i + (i > 16)));
            text = text.replace(new RegExp('\\\\' + name.toLowerCase(), 'g'), String.fromCharCode(945 + i + (i > 16)));
        }

        // Subscripts
        for(i = 0; i < 10; i++) {
            text = text.replace(new RegExp('_' + i, 'g'), String.fromCharCode(8320 + i));
        }

        return text;
    }

    function canvasHasFocus() {
        return (document.activeElement || document.body) === document.body;
    }

    var caretTimer = null;
    var caretVisible = false;

    function stopCaret() { clearInterval(caretTimer); caretVisible = false; }

    function resetCaret() {
        stopCaret();
        if(listenersStarted) {
            caretVisible = true;
            caretTimer = setInterval(
                function() {
                    if(!selectedObject || !canvasHasFocus()) { // then stop updating caret (and constantly draw()ing)
                        stopCaret();
                    } else {
                        caretVisible = !caretVisible;
                    }
                    draw();
                },
                500
            );
        }
    }

    var listenersStarted = false;

    var canvas = null;
    var fsmAlphabetContainer = null; // optional and must be checked each time before use
    var nodes = [];
    var links = [];

    var snapToPadding = 6; // pixels
    var hitTargetPadding = 6; // pixels
    var selectedObject = null; // either a Link or a Node
    var currentLink = null; // a Link
    var movingObject = false;
    var originalClick = null;

    var shift = false;

    window.addEventListener('load', function() {
        initCanvas(quickTestCanvasId); // use convenient canvas element if any
    });

    function setConfigFor(type) {
        switch(type) {
            case 'fsm':
                config.canvas.acceptLinks = true;
                config.canvas.acceptSelfLinks = true;
                config.canvas.acceptStartLinks = true;
                config.links.arrowHeadAtSrc = false;
                config.links.arrowHeadAtSrcOverridable = false;
                config.links.arrowHeadAtDst = true;
                config.links.arrowHeadAtDstOverridable = false;
                config.nodes.canBeAcceptStates = true;
                setFsmAlphabetVisible(true);
                break;
            case 'digraph':
                config.canvas.acceptLinks = true;
                config.canvas.acceptSelfLinks = true;
                config.canvas.acceptStartLinks = false;
                config.links.arrowHeadAtSrc = false;
                config.links.arrowHeadAtSrcOverridable = true;
                config.links.arrowHeadAtDst = true;
                config.links.arrowHeadAtDstOverridable = false;
                config.nodes.canBeAcceptStates = false;
                setFsmAlphabetVisible(false);
                break;
            case 'undigraph':
                config.canvas.acceptLinks = true;
                config.canvas.acceptSelfLinks = true;
                config.canvas.acceptStartLinks = false;
                config.links.arrowHeadAtSrc = false;
                config.links.arrowHeadAtSrcOverridable = false;
                config.links.arrowHeadAtDst = false;
                config.links.arrowHeadAtDstOverridable = false;
                config.nodes.canBeAcceptStates = false;
                setFsmAlphabetVisible(false);
                break;
            case 'array':
                config.canvas.acceptLinks = false;
                config.canvas.acceptSelfLinks = false;
                config.canvas.acceptStartLinks = false;
                config.links.arrowHeadAtSrc = false;
                config.links.arrowHeadAtSrcOverridable = false;
                config.links.arrowHeadAtDst = false;
                config.links.arrowHeadAtDstOverridable = false;
                config.nodes.canBeAcceptStates = false;
                setFsmAlphabetVisible(false);
                break;
        }
    }

    // Initializes canvas so that it is ready to interact with and returns
    // whether initialization is a success. The canvasId parameter is required
    // but options is not. Also note that this function calls setCanvas() and
    // initFsmAlphabetContainer() whose documentation we recommend reading.
    //
    // You don't need to call this function unless your canvas has a specific id
    // (i.e. you are not using the quick-test-canvas-id).
    function initCanvas(canvasId, options) {
        var optionsCanvas = options ? options.canvas : undefined;
        var optionsFsmAlphabetContainer = options ? options.fsmAlphabetContainer : undefined;

        if(canvas) {
            stopListeners();
        }

        var canvasOk = setCanvas(canvasId, optionsCanvas);
        if(canvasOk) {
            initFsmAlphabetContainer(canvasId, optionsFsmAlphabetContainer);
            if(!restoreBackupAuto()) {
                draw(); // we draw() only when restoreBackupAuto() didn't do so
            }
            startListeners();
        }
        return canvasOk;
    }

    // Initializes FSM alphabet container from canvas' properties and returns
    // whether initialization is a success. Note that canvas must be visible
    // and alphabet container (if any) is assumed to be an Html
    // <input type="text"> element.
    function initFsmAlphabetContainer(canvasId, options) {
        if(!canvas) return false;

        var inputTextId = canvasId + '_fsm_alphabet';
        var inputTextElt = document.getElementById(inputTextId);
        fsmAlphabetContainer = inputTextElt;
        if(!fsmAlphabetContainer) {
            if('showCanvas' in options) { // make sure canvas is shown if expected
                options.showCanvas();
            }
            return false;
        }

        var height = 20;
        if(options) {
            if('height' in options) height = options.height;
        }
        fsmAlphabetContainer.placeholder = "FSM alphabet: comma-separated string";
        fsmAlphabetContainer.style.position = 'absolute';
        tieFsmAlphabetCOntainerToCanvas(options);
        fsmAlphabetContainer.style.width = (canvas.width * 0.75) + 'px';
        fsmAlphabetContainer.style.height = height + 'px';
        if(options && options.showAlphabet) { // make sure alphabet container is shown if expected
            options.showAlphabet(inputTextId);
        }
        return true;
    }

    function tieFsmAlphabetCOntainerToCanvas(options) {
        if(!canvas || !fsmAlphabetContainer) return;

        var spacingTop = 10;
        var spacingLeft = 10;
        if(options) {
            if('spacingTop' in options) spacingTop = options.spacingTop;
            if('spacingLeft' in options) spacingLeft = options.spacingLeft;
            if('showCanvas' in options) { // make sure canvas is visible: see getBoundingClientRect()
                options.showCanvas();
            }
        }
        var canvasRect = canvas.getBoundingClientRect(); // computation will be wrong if canvas is invisible
        var canvasRectTop = canvasRect.top + window.scrollY; // in case page is scrolled
        var canvasRectLeft = canvasRect.left + window.scrollX; // in case page is scrolled
        fsmAlphabetContainer.style.top =  (canvasRectTop + spacingTop) + 'px';
        fsmAlphabetContainer.style.left = (canvasRectLeft + spacingLeft) + 'px';
    }
    function getFsmAlphabetStr() { return fsmAlphabetContainer ? fsmAlphabetContainer.value : ''; }
    function setFsmAlphabetStr(str) { // doesn't matter if parameter is a string
        if(fsmAlphabetContainer) {
            fsmAlphabetContainer.value = str;
            fsmAlphabetContainer.dispatchEvent(new CustomEvent('input')); // otherwise input-event callback won't be called
        }
    }
    function setFsmAlphabetVisible(visible) {
        if(fsmAlphabetContainer) {
            fsmAlphabetContainer.style.display = visible ? 'block': 'none';
        }
    }

    // Sets canvas and possibly resizes it. See setCanvasSize().
    function setCanvas(id, options) {
        canvas = document.getElementById(id);
        setCanvasSize(options);
        return canvas !== null;
    }

    // Sets canvas size in case the options object has the expected properties.
    function setCanvasSize(options) {
        if(canvas && options && 'width' in options && 'height' in options) {
            var canvasWidth = options.width; // new width
            var canvasHeight = options.height; // new height
            if(options.fitSizeToScreen === true) {
                var screenObj = window.screen;
                if(screenObj) {
                    if('availWidth' in screenObj) {
                        var screenWidth = screenObj.availWidth;
                        var screenWidthFactor = options.fitSizeToScreenWidthFactor;
                        if(!valueIsNumberInRange(screenWidthFactor, 0, 1)) {
                            screenWidthFactor = 0.75;
                        }
                        if(canvasWidth >= screenWidth) {
                            canvasWidth = screenWidthFactor * screenWidth;
                        }
                    }

                    if('availHeight' in screenObj) {
                        var screenHeight = screenObj.availHeight;
                        var screenHeightFactor = options.fitSizeToScreenHeightFactor;
                        if(!valueIsNumberInRange(screenHeightFactor, 0, 1)) {
                            screenHeightFactor = 0.75;
                        }
                        if(canvasHeight >= screenHeight) {
                            canvasHeight = screenHeightFactor * screenHeight;
                        }
                    }
                }
            }
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
        }
    }

    // Moves nodes into canvas visible area but doesn't draw(). You might need
    // to call this function to make sure nodes are visible (in case canvas is
    // resized to fit the user's screen).
    function moveNodesIntoCanvasVisibleArea() {
        // We assume that canvas is large and long enough for nodes to be fully
        // visible after they are repositioned.
        for(var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if(node.x < node.radius) node.x = node.radius;
            if(node.x > canvas.width - node.radius) node.x = canvas.width - node.radius;
            if(node.y < node.radius) node.y = node.radius;
            if(node.y > canvas.height - node.radius) node.y = canvas.height - node.radius;
        }
    }

    function draw() {
        drawUsing(canvas.getContext('2d'));
        saveBackupAuto();
    }

    function drawUsing(c) {
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.save();
        c.translate(0.5, 0.5);

        c.lineWidth = 1;
        var i = 0;
        for(i = 0; i < nodes.length; i++) {
            nodes[i].draw(c, nodes[i] === selectedObject);
        }
        for(i = 0; i < links.length; i++) {
            links[i].draw(c, links[i] === selectedObject);
        }
        if(currentLink !== null) {
            currentLink.draw(c, currentLink === selectedObject);
        }

        c.restore();
    }

    // Starts listening to mouse/key events.
    function startListeners() {
        canvas.ondblclick = onCanvasDblclick; // see (1) below
        canvas.onmousedown = onCanvasMousedown; // see (1) below
        canvas.onmousemove = onCanvasMousemove; // see (1) below
        canvas.onmouseup = onCanvasMouseup; // see (1) below

        if(fsmAlphabetContainer) {
            fsmAlphabetContainer.oninput = onFsmAlphabetContainerUpdated;
        }

        document.addEventListener('keydown', onDocumentKeydown);
        document.addEventListener('keyup', onDocumentKeyup);
        document.addEventListener('keypress', onDocumentKeypress);

        listenersStarted = true;

        // (1) We didn't use addEventListener() because in Google Chrome 79.0.*
        //     canvas events are also propagated to surrounding text elements.
        //     As a result one can select text in page by double-clicking in
        //     canvas for instance.
    }

    // Stops listening to mouse/key events, resets related variables and draw().
    function stopListeners() {
        canvas.ondblclick = null;
        canvas.onmousedown = null;
        canvas.onmousemove = null;
        canvas.onmouseup = null;

        if(fsmAlphabetContainer) {
            fsmAlphabetContainer.oninput = null;
        }

        document.removeEventListener('keydown', onDocumentKeydown);
        document.removeEventListener('keyup', onDocumentKeyup);
        document.removeEventListener('keypress', onDocumentKeypress);

        selectedObject = null;
        movingObject = false;
        originalClick = null;
        currentLink = null;
        shift = false;
        listenersStarted = false;
        stopCaret();

        draw();
    }

    function onCanvasDblclick(e) {
        var mouse = crossBrowserRelativeMousePos(e);
        selectedObject = selectObject(mouse.x, mouse.y);

        if(selectedObject === null) {
            selectedObject = new Node(mouse.x, mouse.y);
            nodes.push(selectedObject);
            resetCaret();
            draw();
        } else {
            if(selectedObject instanceof Node) {
                if(config.nodes.canBeAcceptStates) {
                    selectedObject.isAcceptState = !selectedObject.isAcceptState;
                    draw();
                }
            } else if(selectedObject instanceof Link) {
                if(config.links.arrowHeadAtSrcOverridable) { // allow the user to quickly set arrow-head at source node
                    selectedObject.nodeAHasArrow = !selectedObject.nodeAHasArrow;
                    draw();
                }
            }
        }
    }

    function onCanvasMousedown(e) {
        var mouse = crossBrowserRelativeMousePos(e);
        selectedObject = selectObject(mouse.x, mouse.y);
        movingObject = false;
        originalClick = mouse;

        if(shift && fsmAlphabetContainer) {
            fsmAlphabetContainer.blur(); // remove focus
        }

        if(selectedObject !== null) {
            if(shift && selectedObject instanceof Node) {
                currentLink = new SelfLink(selectedObject, mouse);
            } else {
                movingObject = true;
                if(selectedObject.setMouseStart) {
                    selectedObject.setMouseStart(mouse.x, mouse.y);
                }
            }
            resetCaret();
        } else if(shift) {
            currentLink = new TemporaryLink(mouse, mouse);
        }

        draw();

        if(canvasHasFocus()) {
            // disable drag-and-drop only if the canvas is already focused
            return false;
        } else {
            // otherwise, let the browser switch the focus away from wherever it was
            resetCaret();
            return true;
        }
    }

    function onCanvasMousemove(e) {
        var mouse = crossBrowserRelativeMousePos(e);

        if(currentLink !== null) {
            var targetNode = selectObject(mouse.x, mouse.y);
            if(!(targetNode instanceof Node)) {
                targetNode = null;
            }

            if(selectedObject === null) {
                if(targetNode !== null) {
                    currentLink = new StartLink(targetNode, originalClick);
                } else {
                    currentLink = new TemporaryLink(originalClick, mouse);
                }
            } else {
                if(targetNode === selectedObject) {
                    currentLink = new SelfLink(selectedObject, mouse);
                } else if(targetNode !== null) {
                    currentLink = new Link(selectedObject, targetNode);
                } else {
                    currentLink = new TemporaryLink(selectedObject.closestPointOnCircle(mouse.x, mouse.y), mouse);
                }
            }
            draw();
        }

        if(movingObject) {
            selectedObject.setAnchorPoint(mouse.x, mouse.y);
            if(selectedObject instanceof Node) {
                snapNode(selectedObject);
            }
            draw();
        }
    }

    function onCanvasMouseup(e) {
        var mouse = crossBrowserRelativeMousePos(e);
        movingObject = false;

        if(currentLink !== null) {
            if(currentLink.prepareInsertionToCanvas()) {
                selectedObject = currentLink;
                links.push(currentLink);
                resetCaret();
            }
            currentLink = null;
            draw();
        }
        else if(!selectedObject && originalClick) {
            var dx = mouse.x - originalClick.x;
            var dy = mouse.y - originalClick.y;
            for(var i = 0; i < nodes.length; i++) {
                nodes[i].x += dx;
                nodes[i].y += dy;
            }
            draw();
        }
    }

    function onFsmAlphabetContainerUpdated(e) { saveBackupAuto(); }

    function onDocumentKeydown(e) {
        var key = crossBrowserKey(e);

        if(key === 16) {
            shift = true;
        } else if(!canvasHasFocus()) {
            // don't read keystrokes when other things have focus
            return true;
        } else if(key === 8) { // backspace key
            if(selectedObject !== null && 'text' in selectedObject) {
                selectedObject.text = selectedObject.text.substr(0, selectedObject.text.length - 1);
                resetCaret();
                draw();
            }

            // backspace might be a shortcut for the back button and we do NOT want to change pages
            e.preventDefault(); return false;
        } else if(key === 46) { // delete key
            if(selectedObject !== null) {
                var i = 0;
                for(i = 0; i < nodes.length; i++) {
                    if(nodes[i] === selectedObject) {
                        nodes.splice(i--, 1);
                    }
                }
                for(i = 0; i < links.length; i++) {
                    if(links[i] === selectedObject || links[i].node === selectedObject || links[i].nodeA === selectedObject || links[i].nodeB === selectedObject) {
                        links[i].prepareRemovalFromCanvas();
                        links.splice(i--, 1);
                    }
                }
                selectedObject = null;
                draw();
            }
        }
    }

    function onDocumentKeyup(e) {
        var key = crossBrowserKey(e);

        if(key === 16) {
            shift = false;
        }
    }

    function onDocumentKeypress(e) {
        // don't read keystrokes when other things have focus
        var key = crossBrowserKey(e);
        if(!canvasHasFocus()) {
            // don't read keystrokes when other things have focus
            return true;
        } else if(key >= 0x20 && key <= 0x7E && !e.metaKey && !e.altKey && !e.ctrlKey && selectedObject !== null && 'text' in selectedObject) {
            selectedObject.text += String.fromCharCode(key);
            resetCaret();
            draw();

            // don't let keys do their actions (like space scrolls down the page)
            e.preventDefault(); return false;
        } else if(key === 8) {
            // backspace might be a shortcut for the back button and we do NOT want to change pages
            e.preventDefault(); return false;
        }
    }

    function selectObject(x, y) {
        var i = 0;
        for(i = 0; i < nodes.length; i++) {
            if(nodes[i].containsPoint(x, y)) {
                return nodes[i];
            }
        }
        for(i = 0; i < links.length; i++) {
            if(links[i].containsPoint(x, y)) {
                return links[i];
            }
        }
        return null;
    }

    function snapNode(node) {
        for(var i = 0; i < nodes.length; i++) {
            if(nodes[i] === node) continue;

            if(Math.abs(node.x - nodes[i].x) < snapToPadding) {
                node.x = nodes[i].x;
            }

            if(Math.abs(node.y - nodes[i].y) < snapToPadding) {
                node.y = nodes[i].y;
            }
        }
    }

    function crossBrowserKey(e) {
        e = e || window.event;
        return e.which || e.keyCode;
    }

    function crossBrowserElementPos(e) {
        e = e || window.event;
        var obj = e.target || e.srcElement;
        var x = 0, y = 0;
        while(obj.offsetParent) {
            x += obj.offsetLeft;
            y += obj.offsetTop;
            obj = obj.offsetParent;
        }
        return { 'x': x, 'y': y };
    }

    function crossBrowserMousePos(e) {
        e = e || window.event;
        return {
            'x': e.pageX || e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
            'y': e.pageY || e.clientY + document.body.scrollTop + document.documentElement.scrollTop,
        };
    }

    function crossBrowserRelativeMousePos(e) {
        var element = crossBrowserElementPos(e);
        var mouse = crossBrowserMousePos(e);
        return {
            'x': mouse.x - element.x,
            'y': mouse.y - element.y
        };
    }

    function fixed(number, digits) {
        return number.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
    }

    function det(a, b, c, d, e, f, g, h, i) {
        return a*e*i + b*f*g + c*d*h - a*f*h - b*d*i - c*e*g;
    }

    function circleFromThreePoints(x1, y1, x2, y2, x3, y3) {
        var a = det(x1, y1, 1, x2, y2, 1, x3, y3, 1);
        var bx = -det(x1*x1 + y1*y1, y1, 1, x2*x2 + y2*y2, y2, 1, x3*x3 + y3*y3, y3, 1);
        var by = det(x1*x1 + y1*y1, x1, 1, x2*x2 + y2*y2, x2, 1, x3*x3 + y3*y3, x3, 1);
        var c = -det(x1*x1 + y1*y1, x1, y1, x2*x2 + y2*y2, x2, y2, x3*x3 + y3*y3, x3, y3);
        return {
            'x': -bx / (2*a),
            'y': -by / (2*a),
            'radius': Math.sqrt(bx*bx + by*by - 4*a*c) / (2*Math.abs(a))
        };
    }

    function valueIsBoolean (value) {
        return typeof value === 'boolean';
    }

    function valueIsNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function valueIsNumberInRange(value, min, max) {
        return valueIsNumber(value) && value >= min && value <= max;
    }

    function valueIsString(value) {
        return typeof value === 'string' || value instanceof String;
    }

    function valueIsArray(value) {
        return Array.isArray(value);
    }

    function valueIsColor(value) {
        return valueIsString(value); // don't need to check whether string describes a valid CSS color
                                     // because invalid colors will be ignored when set in canvas
    }

    function readColorProps(propNames, fromObj, toObj) {
        for(var i=0; i<propNames.length; i++) {
            var pn = propNames[i];
            toObj[pn] = valueIsColor(fromObj[pn]) ? fromObj[pn] : toObj[pn];
        }
    }

    function readColorPropsNoCheckings(propNames, fromObj, toObj) {
        for(var i=0; i<propNames.length; i++) {
            toObj[propNames[i]] = fromObj[propNames[i]];
        }
    }

    // Returns one node from a VALID array of VALID nodes. So only the given
    // index is checked.
    function getNodeElt(nodes, eltIndex) {
        if(valueIsNumberInRange(eltIndex, 0, nodes.length-1)) {
            return nodes[eltIndex];
        }
        throw "No node at index " + eltIndex; // we throw an exception to easier code logic
    }

    function fetchJsonObject() {
        var obj = {
            'fsmAlphabet': getFsmAlphabetStr(),
            'nodes': [],
            'links': [],
        };
        var i = 0;
        for(i = 0; i < nodes.length; i++) {
            obj.nodes.push(nodes[i].toJson());
        }
        for(i = 0; i < links.length; i++) {
            obj.links.push(links[i].toJson(nodes));
        }
        return obj;
    }

    function fetchJsonString(space) { // space is optional
        return JSON ? JSON.stringify(fetchJsonObject(), null, space) : '';
    }

    function fetchPngDataString() {
        drawUsing(canvas.getContext('2d'));
        return canvas.toDataURL('image/png');
    }

    function fetchSvgString() {
        var exporter = new ExportAsSVG();
        drawUsing(exporter);
        return exporter.toSVG();
    }

    function fetchLatexString() {
        var exporter = new ExportAsLaTeX();
        drawUsing(exporter);
        return exporter.toLaTeX();
    }

    // Clears but doesn't draw().
    function clear() {
        setFsmAlphabetStr('');
        nodes = [];
        links = [];
    }

    // Loads object and draw().
    function loadJsonObject(obj) {
        // clear first
        clear();

        // now load
        try {
            setFsmAlphabetStr(obj.fsmAlphabet);
            var i = 0;
            for(i = 0; i < obj.nodes.length; i++) {
                var objNode = obj.nodes[i];
                var node = Node.fromJson(objNode);
                if(node) {
                    nodes.push(node);
                }
            }
            for(i = 0; i < obj.links.length; i++) {
                var objLink = obj.links[i];
                var link = null;
                if(objLink.type === 'Link') {
                    link = Link.fromJson(objLink, nodes);
                } else if(objLink.type === 'SelfLink') {
                    link = SelfLink.fromJson(objLink, nodes);
                } else if(objLink.type === 'StartLink') {
                    link = StartLink.fromJson(objLink, nodes);
                }
                if(link !== null && link.prepareInsertionToCanvas()) {
                    links.push(link);
                }
            }
        } catch(e) {}

        draw();
    }

    function loadJsonString(str, jsonFailedToParseCallback, jsonLoadedCallback) {
        if(JSON) {
            try {
                loadJsonObject(JSON.parse(str));
                if(jsonLoadedCallback) {
                    jsonLoadedCallback();
                }
            } catch(e) {
                if(jsonFailedToParseCallback) {
                    jsonFailedToParseCallback(e);
                }
            }
        }
    }

    // Returns all possible types of canvas elements. This function must only be
    // used from the outside of this script. There are several use cases; here
    // are two of them:
    //     - you can use this function along with getContent().
    //     - you can override export functions (like Node.prototype.toJson) to
    //       make output less verbose. Note that depending on the function being
    //       overridden you might also need to copy several helper functions
    //       from this script.
    function getTypes() {
        return {
            'Node': Node,
            'Link': Link,
            'SelfLink': SelfLink,
            'StartLink': StartLink,
        };
    }

    // Returns the content of the canvas element. This function must only be
    // used from the outside of this script. It might be used to synchronize
    // with external models or update canvas content from source code. Note
    // that for performance reasons we return the actual objects used internally
    // in this script. So make sure you don't mess up with them (like adding
    // links while you have configured this controller not to accept links).
    function getContent() {
        return {
            'fsmAlphabetStr': getFsmAlphabetStr(),
            'nodes': nodes,
            'links': links, // you can use the instanceof operator to check link family
                            // see getTypes()
        };
    }

    // Saves backup locally and returns a boolean success/failure flag. You
    // don't need to call this function unless automatic backup is disabled.
    function saveBackup(id) {
        return setLocalStorageItem(id, fetchJsonString());
    }

    // Restores local backup and returns a boolean success/failure flag. You
    // don't need to call this function unless automatic backup is disabled.
    function restoreBackup(id) {
        var success = true;
        loadJsonString(getLocalStorageItem(id), function() {
            setLocalStorageItem(id, '');
            success = false;
        });
        return success;
    }

    function saveBackupAuto() {
        if(config.global.autoBackup) { saveBackup(config.global.autoBackupId); }
    }

    function restoreBackupAuto() {
        return config.global.autoBackup ? restoreBackup(config.global.autoBackupId) : false;
    }

    function setLocalStorageItem(keyStr, valueStr) {
        try { // see (1) at the bottom of this script
            if(window.localStorage) {
                window.localStorage.setItem(keyStr, valueStr);
                return true;
            }
        } catch(e) {}
        return false;
    }

    function getLocalStorageItem(keyStr) {
        try { // see (1) at the bottom of this script
            return window.localStorage ? window.localStorage.getItem(keyStr)
                                       : null; // getItem() also returns null if key does not exist
        } catch(e) {}
        return null; // returning null because "see try-block above"
    }

    var algorithms = (function() {
        // Sets the given properties for each node but doesn't draw().
        function setNodesProps(propNames, propValues) {
            for(var i = 0; i < nodes.length; i++) {
                for(var j = 0; j < propNames.length; j++) {
                    nodes[i][propNames[j]] = propValues[j];
                }
            }
        }

        // Sets the given properties for each link but doesn't draw().
        function setLinksProps(propNames, propValues) {
            for(var i = 0; i < links.length; i++) {
                for(var j = 0; j < propNames.length; j++) {
                    links[i][propNames[j]] = propValues[j];
                }
            }
        }

        // Builds an array of characters from the given comma-separated string
        // and returns an object hosting several properties (see source code).
        //
        // This function is meant to be used when working with finite state
        // machines, in order to convert condensed transition inputs (like
        // "a, b, c") to distinct ones ("a", "b" and "c"). Thus it might also be
        // used to parse alphabet entries (like "a, b" in alphabet "{a, b}" or
        // "" in "{}"). See key examples below:
        //     Input                     | Output                         | Comments
        //     ---------------------------------------------------------------------
        //     "1,"                      | []                             | Failure: trailing comma
        //     "1,20"                    | []                             | Failure: "20" contains more than 1 character
        //     ---------------------------------------------------------------------
        //     "   "                     | []                             | Success: whitespaces are trimmed
        //     "1,2 , '3', ' ' "         | ["1", "2", "3", " "]           | Success: whitespaces are trimmed unless put in single quotes
        //     "',', ';', ;, ''', ', \"" | [",", ";", ";", "'", "'", """] | Success: single quotes do not appear in output array
        //                               |                                |          note that they are required for space and comma only
        function splitString(str) {
            var retVal = {
                'success': false,             // is string successfully splitted?
                'chars': [],                  // array of characters
                'charsObj': {},               // object with each character as property
                                              //     - you might need this in case you don't want
                                              //       to walk through array to find an entry
                'strIsWhitespaceOnly': false, // is string made of whitespace characters only?
                'strHasDuplicates': false,    // does string contain duplicates?
            };

            function pushCharFromStr(s) {
                var c = s.length === 3 ? s[1] : s[0]; // either '<char>' or <char>
                retVal.chars.push(c);
                if(retVal.charsObj[c]) {
                    retVal.strHasDuplicates = true;
                }
                retVal.charsObj[c] = true;
            }

            var strIsWhitespaceOnly = false;
            var matches = str.match(/^\s*$|^\s*('.'|[^,\s])\s*((?:,\s*(?:'.'|[^,\s])\s*)*)$/); // see (1) below
            if(matches !== null) {
                strIsWhitespaceOnly = true;
                var match = matches[0]; // first complete match (unused and identical to input string)
                var group1 = matches[1]; // first capturing group related to match
                var group2 = matches[2]; // second capturing group related to match
                if(group1) {
                    pushCharFromStr(group1);
                    strIsWhitespaceOnly = false;
                }
                if(group2) {
                    matches = group2.match(/,\s*(?:'.'|[^,\s])\s*/g); // see (2) below
                    for(var i = 0; i < matches.length; i++) {
                        var s = matches[i].substring(1).trim();
                        pushCharFromStr(s);
                    }
                }
            }

            retVal.success = (matches !== null);
            retVal.strIsWhitespaceOnly = strIsWhitespaceOnly;

            return retVal;

            // (1) You can test the regex using online testers. It is built as follows.
            //     Let S be the regex for a whitespace:\s
            //     Let A be the regex denoting which parts of the input string we want to capture:'.'|[^,\s]
            //         - Memento: letter A is for ACCEPT (i.e. what we want to accept).
            //     Let C be the regex for comma:,
            //     The final regex results from the following equations:
            //         - R0 = S*R1?     -> skip whitespaces if any and possibly continue in R1
            //         - R1 = AS*R2?    -> whitespaces have been read in R0 and now we can read something to
            //                             accept, continue with possible whitespaces and proceed with a
            //                             comma in R2 (if any)
            //         - R2 = (CS*AS*)* -> whenever we read a comma we must also have something to accept
            //                             (possibly surrounded by whitespaces)
            //     Now lets write R0 using known regexes only (i.e. S, A and C).
            //         - R0 = S*R1?
            //              = S* | S*R1
            //              = S* | S*AS*R2?
            //              = S* | S*AS* | S*AS*R2
            //              = S* | S*AS* | S*AS*(CS*AS*)*
            //           R0 = S* | S*AS*(CS*AS*)*
            //     But how do we implement this in a real application?
            //         - Well, we only want to capture the strings mathed by A. So we can wrap A in
            //           parentheses (regex_for_A). Thus we can easily capture A from the first S*AS* in R0.
            //           For instance when given " 1 , 2,3" we can capture "1" and ignore ", 2,3" for the moment.
            //         - As for the second part (CS*AS*)* the previous technique will no longer work because
            //           repeating a capturing group will only capture the last iteration (e.g. for ", 2,3" we
            //           only get ",3"). So here we will capture the repeated group instead (basically we will
            //           capture the whole string starting at the comma). The captured string can then be matched
            //           in (2) described below.
            //
            // (2) Assuming you have read (1), here we don't need to capture anything (reason why we use (?:). We
            //     just match as many times as possible using the global modifier (g).
        }

        // Returns an object with several properties, each described as per
        // buildFsmModel().
        function getEmptyFsmModel() {
            return {
                'errors': [],        // possibly empty array of errors

                'alphabet': [],      // possibly empty array of inputs/letters
                'states': {
                    'all': [],       // possibly empty array of state ids
                    'initial': [],   // possibly empty array of state ids
                    'accepting': [], // possibly empty array of state ids
                    'isAnyInitialIn': function(stateIds) {
                        for(var i = 0; i < stateIds.length; i++) {
                            if(this.initial.indexOf(stateIds[i]) !== -1) {
                                return true;
                            }
                        }
                        return false;
                    },
                    'isAnyAcceptingIn': function(stateIds) {
                        for(var i = 0; i < stateIds.length; i++) {
                            if(this.accepting.indexOf(stateIds[i]) !== -1) {
                                return true;
                            }
                        }
                        return false;
                    },
                    'getMarkers': function(initial, accepting) {
                        var markers = [];
                        if(initial) markers.push('->');
                        if(accepting) markers.push('*');
                        return markers;
                    },
                },
                'transitions': {
                    'all': {},       // can be accessed as follows:
                                     //     - all[<state_id>] returns a transition object
                                     //                               (always defined when FSM is valid and state id known)
                                     //     - all[<state_id>][<input>] returns undefined or a possibly emty array of state ids
                    'get': function(fromStateId, input) { // this function is not used in buildFsmModel()
                                                          // but can be used anywhere else
                        var transitionObj = this.all[fromStateId];
                        var arrayOrUndefined = transitionObj ? transitionObj[input] : [];
                        return arrayOrUndefined === undefined ? [] : arrayOrUndefined;
                    },
                },
                'canvas': {
                    'nodes': {},     // key/value pairs:
                                     //     - key is the id of a state
                                     //     - value is a node object in canvas (always defined when FSM is valid)
                    'links': {       // use the get() function to access any link supporting a transition
                                     //     - the returned value might be undefined
                        'get': function(fromStateId, input, toStateId) {
                            return this._values[this._idOf(fromStateId, input, toStateId)];
                        },
                        '_values': {},
                        '_set': function(fromStateId, input, toStateId, linkObj) {
                            this._values[this._idOf(fromStateId, input, toStateId)] = linkObj;
                        },
                        '_idOf': function(fromStateId, input, toStateId) {
                            return fromStateId + '-' + input + '-' + toStateId;
                        },
                    },
                },
            };
        }

        // Builds and returns a FSM model from canvas content. The returned
        // model might be invalid (see its 'errors' property). Besides here is
        // what to know about the expected parameters.
        //     - ensureInitialState: tells whether FSM must be considered invalid
        //                           in case it doesn't contain any initial
        //                           state. Defaults to true.
        function buildFsmModel(ensureInitialState) {
            var fsmObj = getEmptyFsmModel();

            var i = 0;
            var invalidCommaSeparatedExplanation = "Here is a valid example using simple quotes when necessary: "
                                                 + "a, 0, -, ', \", ' ', ','.";

            var alphabetSplitted = splitString(getFsmAlphabetStr());
            if(alphabetSplitted.success) {
                if(alphabetSplitted.strHasDuplicates) {
                    fsmObj.errors.push('Alphabet must not contain duplicates.');
                }
                else {
                    fsmObj.alphabet = alphabetSplitted.chars;
                }
            }
            else {
                fsmObj.errors.push('Alphabet is not a valid comma-separated string. ' + invalidCommaSeparatedExplanation);
            }

            for(i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var stateId = convertLatexShortcuts(node.text.trim());
                if(stateId === '') {
                    fsmObj.errors.push("The id of a state is empty.");
                }
                else {
                    if(fsmObj.canvas.nodes[stateId] !== undefined) {
                        fsmObj.errors.push("State '" + stateId + "' is declared more than once.");
                    }
                    else {
                        fsmObj.canvas.nodes[stateId] = node;
                        fsmObj.states.all.push(stateId);
                        if(node.isInitialState) {
                            fsmObj.states.initial.push(stateId);
                        }
                        if(node.isAcceptState) {
                            fsmObj.states.accepting.push(stateId);
                        }
                        fsmObj.transitions.all[stateId] = {}; // transition object
                    }
                }
            }

            if(ensureInitialState === undefined || ensureInitialState) {
                if(fsmObj.states.initial.length === 0) {
                    fsmObj.errors.push("No state has been marked initial.");
                }
            }

            for(i = 0; i < links.length; i++) {
                var link = links[i];
                if(link instanceof Link || link instanceof SelfLink) {
                    var linkText = convertLatexShortcuts(link.text.trim());
                    var linkNodes = link.getTwoExtremityNodes();
                    var transitionState1Id = convertLatexShortcuts(linkNodes[0].text.trim()); // so that state id can match with one previously saved
                    var transitionState2Id = convertLatexShortcuts(linkNodes[1].text.trim()); // same here
                    var transitionInputsSplitted = splitString(linkText);
                    if(transitionInputsSplitted.success && !transitionInputsSplitted.strIsWhitespaceOnly) {
                        var transitionObj = fsmObj.transitions.all[transitionState1Id];
                        if(!transitionObj) continue; // check transition object because FSM might be invalid
                        for(var j = 0; j < transitionInputsSplitted.chars.length; j++) {
                            var input = transitionInputsSplitted.chars[j];
                            if(transitionObj[input] === undefined) {
                                transitionObj[input] = [];
                            }

                            if(alphabetSplitted.charsObj[input]) {
                                transitionObj[input].push(transitionState2Id);
                                fsmObj.canvas.links._set(transitionState1Id, input, transitionState2Id, link);
                            }
                            else {
                                fsmObj.errors.push("Transition input '{0}' is not declared in alphabet.".format(input));
                            }
                        }
                    }
                    else {
                        fsmObj.errors.push(
                            "Transition ('{0}', '{1}', '{2}') ".format(transitionState1Id, linkText, transitionState2Id)
                          + "has an invalid comma-separated input string. " + invalidCommaSeparatedExplanation
                        );
                    }
                }
            }

            return fsmObj;
        }

        // Builds the state-transition table of the given FSM model. Returns an
        // object with two properties: an Html <table> element and a convenient
        // CSS style (see source code).
        //
        // An optional htmlAttrs object might also be passed as parameter in
        // order to add specific Html attributes (id, class, ...) to several
        // table elements (see source code).
        function buildFsmTransitionTable(model, htmlAttrs) {
            var theadContent = [];
            var tbodyContent = [];
            var i = 0;

            if(model.errors.length === 0) {
                // in <thead>: we use <td> instead of <th> so that CSS is less verbose
                theadContent.push('<tr>');
                theadContent.push('    <td></td>');
                theadContent.push('    <td></td>');
                for(i = 0; i < model.alphabet.length; i++) {
                    theadContent.push('    <td>' + model.alphabet[i] + '</td>');
                }
                theadContent.push('</tr>');

                var stateIds = model.states.all;
                for(i = 0; i < stateIds.length; i++) {
                    var sId = stateIds[i];
                    var sIdInitial = (model.states.initial.indexOf(sId) !== -1);
                    var sIdAccepting = (model.states.accepting.indexOf(sId) !== -1);
                    var sIdMarkers = model.states.getMarkers(sIdInitial, sIdAccepting);
                    tbodyContent.push('<tr>');
                    tbodyContent.push('    <td>' + sIdMarkers.join(' ') + '</td>');
                    tbodyContent.push('    <td>' + sId + '</td>');
                    for(var j = 0; j < model.alphabet.length; j++) {
                        var input = model.alphabet[j];
                        tbodyContent.push('    <td>' + model.transitions.get(sId, input).join(', ') + '</td>');
                    }
                    tbodyContent.push('</tr>');
                }
            }
            else {
                theadContent.push('<tr><td>Finite state machine is not valid</td></tr>');
                tbodyContent.push('<tr><td>No content available</td></tr>');
            }

            var tAttrs = '';
            var theadAttrs = '';
            var tbodyAttrs = '';
            if(htmlAttrs) {
                if('table' in htmlAttrs && htmlAttrs.table !== '') tAttrs = ' ' + htmlAttrs.table;
                if('thead' in htmlAttrs && htmlAttrs.thead !== '') theadAttrs = ' ' + htmlAttrs.thead;
                if('tbody' in htmlAttrs && htmlAttrs.tbody !== '') tbodyAttrs = ' ' + htmlAttrs.tbody;
            }

            var tId = '';
            var tIdMatch = tAttrs.match(/id="([^"]+)"/); // regex is quite permissive but very simple
            // also note that the captured id (if any) is used as is in CSS: its characters are not escaped in any way
            if(tIdMatch !== null) {
                tId = tIdMatch[1];
            }

            var stateMarkers = model.states.getMarkers(true, true); // all possible markers
            var tContent =
                '<!-- FSM State-Transition Table - HTML\n'
              + '         Can be saved to *.html file along with the CSS code\n'
              + '         Can also be viewed using HTML online viewers with support for CSS -->\n'
              + '<table{0}>\n'.format(tAttrs)
              + '    <caption>{0}: initial state<br />{1}: accepting state</caption>\n'
                .format(stateMarkers[0], stateMarkers[1]) // legend for markers used in table content
              + '    <thead{0}>\n'.format(theadAttrs)
              + '        ' + theadContent.join('\n        ') + '\n'
              + '    </thead>\n'
              + '    <tbody{0}>\n'.format(tbodyAttrs)
              + '        ' + tbodyContent.join('\n        ') + '\n'
              + '    </tbody>\n'
              + '</table>'
            ;

            var tIdSelectorSpaced = tId === '' ? '' : '#{0} '.format(tId);
            var tIdSelectorBracketed = tId === '' ? '' : '[id={0}]'.format(tId);
            var tCssVar = model.errors.length === 0 ?
                          ', {0}tr td:first-child, {0}tr td:nth-child(2)'.format(tIdSelectorSpaced) :
                          ''
            ;
            var tCss =
                '<!-- FSM State-Transition Table - Quick CSS -->\n'
              + '<style type="text/css">\n'
              + '    {0}caption {\n'.format(tIdSelectorSpaced)
              + '        caption-side: bottom;\n'
              + '    }\n'
              + '    table{0}, {1}td {\n'.format(tIdSelectorBracketed, tIdSelectorSpaced)
              + '        border: 1px solid grey;\n'
              + '    }\n'
              + '    {0}td {\n'.format(tIdSelectorSpaced)
              + '        text-align: center;\n'
              + '        color: #333;\n'
              + '        width: {0}%;\n'.format(100/(2+model.alphabet.length))
              + '    }\n'
              + '    {0}thead td{1} {\n'.format(tIdSelectorSpaced, tCssVar)
              + '        background-color: #333;\n'
              + '        color: white;\n'
              + '    }\n'
              + '</style>'
            ;

            return {
                'table': tContent,
                'css': tCss,
            };
        }

        return {
            'setNodesProps': setNodesProps,
            'setLinksProps': setLinksProps,
            'splitString': splitString,
            'getEmptyFsmModel': getEmptyFsmModel,
            'buildFsmModel': buildFsmModel,
            'buildFsmTransitionTable': buildFsmTransitionTable,
        };
    })();

    var quickTestCanvasId = 'fsmvc_quickTest_canvasId';
    var quickTestOutputId = 'fsmvc_quickTest_outputId';
    var quickTest = (function() {
        function defaultCallback(success, msg, sideNote) {
            window.alert(msg + "\n\n" + sideNote);
        }

        // The returned element can be an Html <textarea> element.
        function getOutputElt() {
            return document.getElementById(quickTestOutputId);
        }

        function isOutputEltVisible() {
            var elt = getOutputElt();
            return window.getComputedStyle(elt, null).display !== 'none'; // relies on the behaviour of outputText()
            // note that getComputedStyle() is required for styles in external stylesheets to be inspected
        }

        function setOutputEltVisible(visible) {
            var elt = getOutputElt();
            elt.style.display = visible ? 'block' : 'none'; // relies on the behaviour of outputText()
        }

        function switchOutputEltVisibility() {
            setOutputEltVisible(!isOutputEltVisible());
        }

        function outputText(text) {
            var elt = getOutputElt();
            elt.style.display = 'block'; // assuming element first had CSS 'display: none;'
            elt.value = text;
        }

        function outputJson() {
            outputText(fetchJsonString(2));
        }

        function outputPng() {
            document.location.href = fetchPngDataString(); // will fail on Chrome
            outputText("Please take a screenshot on your own.\n" +
                       "Indeed if you are reading this, that most likely means image did not show up.");
        }

        function outputSvg() {
            var svgStr = fetchSvgString();
            outputText(svgStr);
            // Chrome isn't ready for this yet, the 'Save As' menu item is disabled
            // document.location.href = 'data:image/svg+xml;base64,' + btoa(svgStr);
        }

        function outputLatex() {
            outputText(fetchLatexString());
        }

        function loadJsonFromOutputElt(callback) {
            if(!callback) { callback = defaultCallback; }

            loadJsonString(
                getOutputElt().value,
                function(e) {
                    callback(false,
                             "JSON failed to parse with a " + e + ".",
                             "Please perform a JSON-export and try again.");
                },
                function() {
                    callback(true,
                             "JSON loaded!",
                             "Note that invalid nodes are ignored or adjusted when necessary. " +
                             "The same goes for links.");
                }
            );
        }

        function clearContent() {
            clear();
            draw();
        }

        // The model parameter must originate from algorithms.buildFsmModel().
        function checkFsm(model) {
            if(model.errors.length === 0) {
                outputText("Finite state machine is valid.");
            }
            else {
                var text = "Finite state machine is not valid."
                for(var i = 0; i < model.errors.length; i++) {
                    text += "\n    - " + model.errors[i];
                }
                outputText(text);
            }
        }

        // The model parameter must originate from algorithms.buildFsmModel().
        function outputFsmTransitionTable(model) {
            var obj = algorithms.buildFsmTransitionTable(model);
            outputText(obj.table + '\n\n' + obj.css);
        }

        function switchConfig(type) {
            setConfigFor(type);
            restoreBackup(config.global.autoBackupId);
        }

        return {
            'isOutputEltVisible': isOutputEltVisible,
            'setOutputEltVisible': setOutputEltVisible,
            'switchOutputEltVisibility': switchOutputEltVisibility,

            'outputText': outputText,
            'outputJson': outputJson,
            'outputPng': outputPng,
            'outputSvg': outputSvg,
            'outputLatex': outputLatex,

            'loadJsonFromOutputElt': loadJsonFromOutputElt,

            'clearContent': clearContent,
            'checkFsm': checkFsm,
            'outputFsmTransitionTable': outputFsmTransitionTable,
            'switchConfig': switchConfig,
        };
    })();

    return { // Expose functions and variables to the outside. For a how-to-use
             // notice please refer to the documentation (comments) of each
             // exposed element in source code. In case no documentation is
             // provided, that means understanding is pretty straightforward.

        'config': config,
        'setConfigFor': setConfigFor,
        'initCanvas': initCanvas,
        'tieFsmAlphabetContainerToCanvas': tieFsmAlphabetCOntainerToCanvas,

        'setCanvas': setCanvas,
        'setCanvasSize': setCanvasSize,
        'moveNodesIntoCanvasVisibleArea': moveNodesIntoCanvasVisibleArea,
        'draw': draw,
        'startListeners': startListeners,
        'stopListeners': stopListeners,

        'fetchJsonObject': fetchJsonObject,
        'fetchJsonString': fetchJsonString,
        'fetchPngDataString': fetchPngDataString,
        'fetchSvgString': fetchSvgString,
        'fetchLatexString': fetchLatexString,

        'clear': clear,
        'loadJsonObject': loadJsonObject,
        'loadJsonString': loadJsonString,

        'getTypes': getTypes,
        'getContent': getContent,
        'convertLatexShortcuts': convertLatexShortcuts,

        'saveBackup': saveBackup,
        'restoreBackup': restoreBackup,

        'algorithms': algorithms,

        'quickTest': quickTest,
    };
})();

// (1) An exception might be raised when trying to access window.localStorage.
//     So any access to the said storage must be wrapped into try-catch block.
//     For instance in Google Chrome when Content Settings prevents from setting
//     any data (basically when cookies are blocked), we get the following error
//     message:
//         - Failed to read the 'localStorage' property from 'Window': Access is denied for this document.
